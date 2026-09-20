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

export function loginUrl(next: string): string {
  return `/login?next=${encodeURIComponent(safeNext(next))}`;
}
