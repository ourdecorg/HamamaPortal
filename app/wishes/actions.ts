"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { discover } from "@/lib/discovery";
import { getProjects } from "@/lib/projects";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildInterpretation,
  discoveryContext,
  wishSchema,
  type SaveWishResult,
  type WishState,
  type WishValues,
} from "@/lib/wish";

const text = (fd: FormData, key: string) => (typeof fd.get(key) === "string" ? (fd.get(key) as string) : "");

/**
 * Analyse a wish against the existing projects.
 * Nothing is stored here: analysing is open to everybody, signed in or not.
 * A wish is only persisted by `saveWish`, when the person chooses to keep it.
 * (Running on the server also means a future LLM key never reaches the browser.)
 */
export async function analyzeWish(_prev: WishState, formData: FormData): Promise<WishState> {
  const raw = {
    wish: text(formData, "wish"),
    outcome: text(formData, "outcome"),
    domain: text(formData, "domain"),
    scope: text(formData, "scope"),
    offer: text(formData, "offer"),
  };

  const parsed = wishSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", error: parsed.error.issues[0]?.message ?? "משהו בטופס לא תקין.", values: raw };
  }
  const v = parsed.data;

  const result = await discover({ query: v.wish, projects: await getProjects(), context: discoveryContext(v) });
  return { status: "ok", result, values: raw };
}

const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Save a wish for the signed-in user. The owner is ALWAYS the session user; the client sends only
 * the wish content. The interpretation is recomputed here rather than trusted from the browser.
 * Wishes start private.
 */
export async function saveWish(values: WishValues): Promise<SaveWishResult> {
  if (!isSupabaseConfigured()) return { status: "error", error: "השמירה עדיין לא הוגדרה בשרת הזה." };

  const user = await getCurrentUser();
  if (!user) return { status: "auth_required" };

  const parsed = wishSchema.safeParse(values);
  if (!parsed.success) return { status: "error", error: parsed.error.issues[0]?.message ?? "המשאלה לא תקינה." };
  const v = parsed.data;

  const result = await discover({ query: v.wish, projects: await getProjects(), context: discoveryContext(v) });
  const supabase = await createSupabaseServerClient();

  // A double click, or a retry after sign-in, must not save the same wish twice.
  const { data: recent } = await supabase
    .from("wishes")
    .select("id")
    .eq("user_id", user.id)
    .eq("text", v.wish)
    .gte("created_at", new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString())
    .limit(1)
    .maybeSingle();
  if (recent) return { status: "saved", id: recent.id as string };

  const { data, error } = await supabase
    .from("wishes")
    .insert({
      user_id: user.id,
      text: v.wish,
      desired_outcome: v.outcome || null,
      domains: v.domain ? [v.domain] : result.interpretation.domains,
      location_scope: v.scope || null,
      visibility: "private",
      status: "open",
      interpretation: buildInterpretation(result, v),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[hamama] saveWish failed:", error?.message);
    return { status: "error", error: "לא הצלחנו לשמור את המשאלה. נסו שוב." };
  }
  revalidatePath("/my-space");
  return { status: "saved", id: data.id as string };
}

const idSchema = z.string().uuid();
const statusSchema = z.enum(["open", "exploring", "connected", "in_progress", "fulfilled", "archived"]);

/** Move one of MY wishes to another status. RLS makes sure it is mine. */
export async function setWishStatus(id: string, status: string): Promise<void> {
  const parsedId = idSchema.safeParse(id);
  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedId.success || !parsedStatus.success || !(await getCurrentUser())) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("wishes").update({ status: parsedStatus.data }).eq("id", parsedId.data);
  revalidatePath("/my-space");
}

/** Delete one of MY wishes. */
export async function deleteWish(id: string): Promise<void> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success || !(await getCurrentUser())) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("wishes").delete().eq("id", parsedId.data);
  revalidatePath("/my-space");
}
