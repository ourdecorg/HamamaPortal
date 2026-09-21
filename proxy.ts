import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  hasLocale,
  isUnlocalizedPath,
  negotiateLocale,
  splitLocale,
  type Locale,
} from "@/lib/i18n/config";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Two jobs, in this order:
 *
 * 1. LANGUAGE. Every page lives under /he or /en. A URL without a language ("/", "/projects") is redirected to
 *    the visitor's language: the one they chose last (cookie), else the browser's Accept-Language, else Hebrew.
 *    A localized URL is served as it is and its language is remembered in a cookie for the next visit.
 *    Route handlers that other services call back (/api, /auth/callback) have no language prefix.
 *
 * 2. SESSION. Keeps the Supabase session fresh. Server Components cannot write cookies, so an expired access
 *    token has to be refreshed here, before rendering, and the new cookies passed on to both the page and the
 *    browser. This is NOT an authorisation layer — pages, server actions and Row Level Security decide who
 *    may do what. Visitors with no Supabase cookie skip it entirely, so anonymous browsing costs nothing extra.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { locale: urlLocale } = splitLocale(pathname);

  if (!urlLocale && !isUnlocalizedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${preferredLocale(request)}${pathname === "/" ? "" : pathname}`;
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Vary", "Accept-Language, Cookie");
    return redirect;
  }

  const response = await refreshSession(request);
  if (urlLocale && request.cookies.get(LOCALE_COOKIE)?.value !== urlLocale) {
    response.cookies.set(LOCALE_COOKIE, urlLocale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return response;
}

function preferredLocale(request: NextRequest): Locale {
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  if (hasLocale(saved)) return saved;
  return negotiateLocale(request.headers.get("accept-language")) ?? DEFAULT_LOCALE;
}

async function refreshSession(request: NextRequest): Promise<NextResponse> {
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
