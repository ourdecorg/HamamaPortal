"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import type {
  ContactError,
  ConversationKind,
  ConversationView,
  SendMessageResult,
  StartConversationResult,
} from "@/lib/conversation";
import { actionLocale } from "@/lib/i18n/action-locale";
import { localePath } from "@/lib/i18n/config";
import { isMailConfigured } from "@/lib/mail/config";
import { sendMailSoon } from "@/lib/mail/schedule";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient, createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Contacting people: email and chat conversations. Every call runs with the signed-in person's own session, and
 * the database functions (20260929120000_contacts.sql) decide what is allowed — who can be contacted, whose
 * conversation this is, rate limits. Nothing here ever sees an email address; outgoing mail is queued by the
 * database and sent by the mail worker after the response (`sendMailSoon`).
 */

const uuid = z.uuid();
const kindSchema = z.enum(["email", "chat"]);

const startSchema = z.object({
  projectId: uuid,
  personId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  kind: kindSchema,
  subject: z.string().max(200).default(""),
  body: z.string().trim().min(1).max(5000),
});

/** Database error → what to tell the person. */
function contactError(code: string | undefined): ContactError | "auth_required" {
  switch (code) {
    case "28000":
      return "auth_required";
    case "HA101":
      return "optedOut";
    case "HA102":
      return "self";
    case "HA103":
      return "chatNeedsAccount";
    case "HA104":
      return "tooMany";
    case "P0002":
      return "unavailable";
    case "22023":
      return "invalid";
    default:
      return "failed";
  }
}

function fail(code: string | undefined, message: string, where: string): { status: "auth_required" } | { status: "error"; error: ContactError } {
  const error = contactError(code);
  if (error === "auth_required") return { status: "auth_required" };
  if (error === "failed") console.error(`[hamama] ${where} failed:`, code, message);
  return { status: "error", error };
}

/** Write to a person on an initiative's team — the start of a conversation, or the next message in yours. */
export async function startConversation(raw: unknown, localeArg: string): Promise<StartConversationResult> {
  const locale = actionLocale(localeArg);
  const input = startSchema.safeParse(raw);
  if (!input.success) return { status: "error", error: "invalid" };
  if (!isSupabaseConfigured()) return { status: "error", error: "unavailable" };
  if (input.data.kind === "email" && !isMailConfigured()) return { status: "error", error: "mailUnavailable" };
  if (input.data.kind === "email" && !input.data.subject.trim()) return { status: "error", error: "invalid" };
  if (!(await getCurrentUser())) return { status: "auth_required" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_conversation", {
    p_project_id: input.data.projectId,
    p_person_id: input.data.personId,
    p_kind: input.data.kind,
    p_subject: input.data.subject,
    p_body: input.data.body,
    p_locale: locale,
  });
  if (error) return fail(error.code, error.message, "startConversation");

  await sendMailSoon();
  return { status: "ok", conversationId: data as string };
}

/** Write in one of your conversations. */
export async function sendMessage(conversationId: string, body: string, localeArg: string): Promise<SendMessageResult> {
  const locale = actionLocale(localeArg);
  const text = z.string().trim().min(1).max(5000).safeParse(body);
  if (!uuid.safeParse(conversationId).success || !text.success) return { status: "error", error: "invalid" };
  if (!isSupabaseConfigured()) return { status: "error", error: "unavailable" };
  if (!(await getCurrentUser())) return { status: "auth_required" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("post_message", { p_conversation_id: conversationId, p_body: text.data, p_locale: locale });
  if (error) return fail(error.code, error.message, "sendMessage");

  await sendMailSoon();
  return { status: "ok" };
}

/**
 * One of your conversations (marking it read). With `after`, only the messages since then — what the open
 * conversation polls for. Null when it is not yours (or you are signed out).
 */
export async function loadConversation(conversationId: string, after?: string): Promise<ConversationView | null> {
  if (!isSupabaseConfigured() || !uuid.safeParse(conversationId).success) return null;
  if (after !== undefined && !z.iso.datetime({ offset: true }).safeParse(after).success) return null;
  if (!(await getCurrentUser())) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("conversation_view", { p_conversation_id: conversationId, p_after: after ?? null });
  if (error) {
    console.error("[hamama] loadConversation failed:", error.code, error.message);
    return null;
  }
  return (data as ConversationView | null) ?? null;
}

/** Your existing conversation of this kind with a team member, if there is one. */
export async function findConversation(projectId: string, personId: string, kind: ConversationKind): Promise<string | null> {
  if (!isSupabaseConfigured() || !uuid.safeParse(projectId).success || !kindSchema.safeParse(kind).success) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(personId) || !(await getCurrentUser())) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("find_conversation", { p_project_id: projectId, p_person_id: personId, p_kind: kind });
  if (error) {
    console.error("[hamama] findConversation failed:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/** Stop (or resume) getting emails from one of your conversations. */
export async function setConversationMuted(conversationId: string, muted: boolean): Promise<boolean> {
  if (!isSupabaseConfigured() || !uuid.safeParse(conversationId).success) return false;
  if (!(await getCurrentUser())) return false;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_conversation_muted", { p_conversation_id: conversationId, p_muted: Boolean(muted) });
  if (error) console.error("[hamama] setConversationMuted failed:", error.message);
  return !error;
}

/**
 * The "stop" link in an email, after the person confirmed on the page. No account needed — the token in the
 * link is the proof. Returns what was stopped, or null for an unknown token.
 */
export async function stopByToken(token: string): Promise<"conversation" | "contact" | null> {
  if (!isSupabaseConfigured() || !uuid.safeParse(token).success) return null;
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("contact_stop", { p_token: token });
  if (error) {
    console.error("[hamama] contact_stop failed:", error.message);
    return null;
  }
  return data === "conversation" || data === "contact" ? data : null;
}

/** The stop page's confirm button: stop, then show the outcome. */
export async function confirmStop(formData: FormData): Promise<void> {
  const locale = actionLocale(formData.get("locale"));
  const result = await stopByToken(String(formData.get("t") ?? ""));
  redirect(localePath(locale, `/contact/stop?done=${result ?? "invalid"}`));
}
