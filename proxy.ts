import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Keeps the Supabase session fresh.
 *
 * Server Components cannot write cookies, so an expired access token has to be refreshed here, before
 * rendering, and the new cookies passed on to both the page and the browser. This is NOT an
 * authorisation layer — pages, server actions and Row Level Security decide who may do what.
 *
 * Visitors with no Supabase cookie skip it entirely, so anonymous browsing costs nothing extra.
 */
export async function proxy(request: NextRequest) {
  const supabaseConfig = getSupabaseConfig();
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!supabaseConfig || !hasSession) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseConfig.url, supabaseConfig.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Validates the token and refreshes it (via setAll above) when it has expired.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
