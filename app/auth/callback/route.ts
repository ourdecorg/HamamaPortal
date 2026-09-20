import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where Google / the magic link send the browser back to.
 * Exchanges the one-time `code` for a session (stored in cookies) and continues to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));
  const site = await getSiteUrl();
  const fail = (error: string) => NextResponse.redirect(`${site}/login?error=${error}&next=${encodeURIComponent(next)}`);

  if (!isSupabaseConfigured()) return fail("unconfigured");
  if (searchParams.get("error")) return fail("denied");

  const code = searchParams.get("code");
  if (!code) return fail("callback");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail("callback");

  return NextResponse.redirect(`${site}${next}`);
}
