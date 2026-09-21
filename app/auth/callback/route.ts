import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { DEFAULT_LOCALE, splitLocale } from "@/lib/i18n/config";
import { getSiteUrl } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where Google / the magic link send the browser back to.
 * Exchanges the one-time `code` for a session (stored in cookies) and continues to `next`.
 * This URL has no language prefix (it is on the allow-lists of Supabase and Google); the language comes from
 * `next`, which is a localized path such as "/en/my-space".
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const site = await getSiteUrl();
  const next = safeNext(searchParams.get("next"), `/${DEFAULT_LOCALE}`);
  const locale = splitLocale(next).locale ?? DEFAULT_LOCALE;

  const fail = (error: string) =>
    NextResponse.redirect(`${site}/${locale}/login?error=${error}&next=${encodeURIComponent(next)}`);

  if (!isSupabaseConfigured()) return fail("unconfigured");
  if (searchParams.get("error")) return fail("denied");

  const code = searchParams.get("code");
  if (!code) return fail("callback");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail("callback");

  return NextResponse.redirect(`${site}${next}`);
}
