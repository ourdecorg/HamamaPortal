import { localePath, type Locale } from "@/lib/i18n/config";

/**
 * Post-login destinations. Pure (no server imports) so client components can build login links too.
 *
 * Only same-site relative paths (optionally with ?query and #fragment) are accepted, so
 * /login?next=https://evil.example can never become an open redirect.
 */
export function safeNext(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || /[\u0000-\u001f]/.test(raw)) return fallback;
  return raw.slice(0, 500);
}

/** The sign-in page URL that returns to `next`. With a locale, both the login page and `next` get its prefix. */
export function loginUrl(next: string, locale?: Locale): string {
  const target = safeNext(next);
  if (!locale) return `/login?next=${encodeURIComponent(target)}`;
  return `/${locale}/login?next=${encodeURIComponent(localePath(locale, target))}`;
}
