"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/auth";
import { actionLocale, actionMessages } from "@/lib/i18n/action-locale";
import type { Locale } from "@/lib/i18n/config";
import { getSiteUrl } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sign-in and sign-out run on the server, so no Supabase key or client is shipped to the browser.
 * The PKCE code verifier is kept in an httpOnly cookie by @supabase/ssr; /auth/callback completes the login.
 *
 * The forms send their page language as a hidden `locale` field, so redirects and messages stay in it.
 * `next` is already a localized path ("/en/my-space"); /auth/callback is deliberately NOT localized, because
 * that exact URL is what Supabase and Google have on their allow-lists.
 */

const back = (locale: Locale, next: string, error: string) =>
  `/${locale}/login?error=${error}&next=${encodeURIComponent(next)}`;

async function callbackUrl(next: string): Promise<string> {
  return `${await getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const locale = actionLocale(formData.get("locale"));
  const next = safeNext(formData.get("next"), `/${locale}`);
  if (!isSupabaseConfigured()) redirect(back(locale, next, "unconfigured"));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl(next) },
  });
  // redirect() throws, so it must stay outside any try/catch.
  if (error || !data.url) redirect(back(locale, next, "oauth"));
  redirect(data.url);
}

export interface MagicLinkState {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
}

export async function signInWithEmail(_prev: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const locale = actionLocale(formData.get("locale"));
  const m = actionMessages(locale).actions;
  const next = safeNext(formData.get("next"), `/${locale}`);
  const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email(m.emailInvalid));
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? m.emailInvalidShort };
  }
  if (!isSupabaseConfigured()) return { status: "error", message: m.authUnconfigured };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: await callbackUrl(next) },
  });
  if (error) {
    const limited = error.status === 429 || /rate/i.test(error.message);
    return {
      status: "error",
      message: limited ? m.rateLimited : m.linkFailed,
      email: parsed.data,
    };
  }
  return { status: "sent", email: parsed.data };
}

export async function signOut(formData: FormData): Promise<void> {
  const locale = actionLocale(formData.get("locale"));
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect(`/${locale}`);
}
