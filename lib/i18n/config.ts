/**
 * Locale configuration — pure (no React, no Next), so the proxy, server code and client components can
 * all import it. To add a language: add it to LOCALES and LOCALE_META, then write
 * lib/i18n/messages/<code>.ts (typed against the Hebrew file, so a missing key is a compile error) and
 * register it in lib/i18n/messages/index.ts.
 */
export const LOCALES = ["he", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "he";

/** Remembers the visitor's choice for the next visit (set by the proxy whenever a localized URL is served). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** `englishName` is how the language is named to the translation model (lib/translation.ts). */
export const LOCALE_META: Record<Locale, { name: string; englishName: string; dir: "rtl" | "ltr"; dateLocale: string }> = {
  he: { name: "עברית", englishName: "Hebrew", dir: "rtl", dateLocale: "he-IL" },
  en: { name: "English", englishName: "English", dir: "ltr", dateLocale: "en-GB" },
};

export function hasLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Paths that are served without a locale prefix: route handlers that external services call back. */
export function isUnlocalizedPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/") || pathname === "/auth/callback";
}

/** "/en/projects?x=1" → { locale: "en", path: "/projects?x=1" }. A path with no locale gives locale null. */
export function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const match = /^\/([^/?#]+)(.*)$/.exec(pathname);
  if (match && hasLocale(match[1])) return { locale: match[1], path: match[2] || "/" };
  return { locale: null, path: pathname || "/" };
}

/**
 * Put a locale in front of a site-internal path ("/projects" → "/en/projects"). Paths that already have one,
 * hash-only links, external URLs and the un-localized route handlers are returned unchanged.
 */
export function localePath(locale: Locale, href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  if (isUnlocalizedPath(href.split(/[?#]/)[0])) return href;
  if (splitLocale(href).locale) return href;
  const rest = href === "/" ? "" : href;
  return `/${locale}${rest.startsWith("/") || rest === "" ? rest : `/${rest}`}`;
}

/** The best supported locale for an Accept-Language header ("en-US,en;q=0.9,he;q=0.8"), or null. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { base: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((l) => l.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { base } of ranked) {
    // "iw" is the legacy code some browsers still send for Hebrew.
    const code = base === "iw" ? "he" : base;
    if (hasLocale(code)) return code;
  }
  return null;
}
