import { after } from "next/server";
import { getMailConfig } from "@/lib/mail/config";
import { guessLocale, replyText, replyTokenFrom, verifyWebhook } from "@/lib/mail/inbound";
import { flushOutbox } from "@/lib/mail/outbox";
import { getReceivedEmail } from "@/lib/mail/resend";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Resend's "email.received" webhook: someone replied to a portal email (to reply+<token>@MAIL_REPLY_DOMAIN).
 *
 *  1. The request must be signed by Resend (RESEND_WEBHOOK_SECRET), and recent.
 *  2. The token in the address says who is writing, in which conversation. It is a secret only that participant
 *     received; nothing else about the sender is trusted.
 *  3. The body is fetched from Resend (the webhook only has metadata), the quoted original is removed, and the
 *     database adds the message (`mail_ingest`, which answers only to MAIL_WORKER_SECRET). The same email is never
 *     added twice.
 *
 * Answers 200 to anything it deliberately ignores (so Resend does not retry it) and 5xx when it could not finish
 * (so Resend retries).
 */

const MAX_BODY = 256 * 1024;
const ok = (status = "ok") => Response.json({ status });

export async function POST(request: Request) {
  const config = getMailConfig();
  if (!config?.webhookSecret || !isSupabaseConfigured()) return Response.json({ error: "Not configured" }, { status: 404 });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "Too large" }, { status: 413 });
  const signed = verifyWebhook(
    config.webhookSecret,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    raw,
  );
  if (!signed) return Response.json({ error: "Invalid signature" }, { status: 401 });

  let event: { type?: string; data?: { email_id?: string; to?: string[]; cc?: string[]; received_for?: string[]; message_id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (event.type !== "email.received" || !event.data?.email_id) return ok("ignored");

  const data = event.data;
  const token = replyTokenFrom([...(data.to ?? []), ...(data.cc ?? []), ...(data.received_for ?? [])], config.replyDomain);
  if (!token) return ok("no-token");

  const email = await getReceivedEmail(config, data.email_id!);
  if (!email) return Response.json({ error: "Could not read the email" }, { status: 502 });
  const body = replyText(email);
  if (!body) return ok("empty");

  const supabase = createPublicClient();
  const { data: result, error } = await supabase.rpc("mail_ingest", {
    p_secret: config.workerSecret,
    p_token: token,
    p_body: body,
    p_inbound_id: data.email_id,
    p_locale: guessLocale(body),
  });
  if (error) {
    console.error("[hamama] mail_ingest failed:", error.code, error.message);
    return Response.json({ error: "Could not store the reply" }, { status: 500 });
  }
  if (!result) return ok("unknown-token");

  // The reply may have queued emails to the other side.
  const site = await getSiteUrl();
  after(async () => {
    await flushOutbox(site);
  });
  return ok((result as { status?: string }).status ?? "ok");
}
