import { headers } from "next/headers";

/**
 * The public origin of the site, used to build OAuth / magic-link return URLs.
 *
 * Behind Railway's proxy the request URL can carry an internal host, so prefer:
 *   1. SITE_URL (explicit; recommended in production, e.g. https://hamama.up.railway.app)
 *   2. the forwarded host/proto headers
 *   3. the plain Host header
 * The result must be listed under Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export async function getSiteUrl(): Promise<string> {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}
