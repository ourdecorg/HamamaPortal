"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sign-in and sign-out run on the server, so no Supabase key or client is shipped to the browser.
 * The PKCE code verifier is kept in an httpOnly cookie by @supabase/ssr; /auth/callback completes the login.
 */

const back = (next: string, error: string) => `/login?error=${error}&next=${encodeURIComponent(next)}`;

async function callbackUrl(next: string): Promise<string> {
  return `${await getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNext(formData.get("next"));
  if (!isSupabaseConfigured()) redirect(back(next, "unconfigured"));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl(next) },
  });
  // redirect() throws, so it must stay outside any try/catch.
  if (error || !data.url) redirect(back(next, "oauth"));
  redirect(data.url);
}

export interface MagicLinkState {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
}

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email("כתובת המייל לא נראית תקינה."));

export async function signInWithEmail(_prev: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const next = safeNext(formData.get("next"));
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "כתובת המייל לא תקינה." };
  }
  if (!isSupabaseConfigured()) return { status: "error", message: "ההתחברות עדיין לא הוגדרה בשרת." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: await callbackUrl(next) },
  });
  if (error) {
    const limited = error.status === 429 || /rate/i.test(error.message);
    return {
      status: "error",
      message: limited ? "נשלחו כמה בקשות ברצף. נסו שוב בעוד כמה דקות." : "לא הצלחנו לשלוח את הקישור. נסו שוב.",
      email: parsed.data,
    };
  }
  return { status: "sent", email: parsed.data };
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
