/**
 * Supabase configuration, read from the server environment at RUNTIME.
 *
 *   SUPABASE_URL       https://<project-ref>.supabase.co
 *   SUPABASE_ANON_KEY  the anon / publishable key (safe to expose, RLS protects the data)
 *
 * No NEXT_PUBLIC_ variables: the app has no browser-side Supabase client. Sign-in, sign-out and every
 * mutation happen in server actions, so no Supabase key is ever bundled into client code — and the
 * values are read when the server starts, not baked in at build time (which matters on Railway).
 *
 * The service-role key is deliberately NOT read anywhere in the app. It is only used by the CLI
 * scripts in /scripts (seed, steward approval).
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  try {
    new URL(url);
  } catch {
    console.error("[hamama] SUPABASE_URL is not a valid URL — running in demo mode.");
    return null;
  }
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export function requireSupabaseConfig(): SupabaseConfig {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured (set SUPABASE_URL and SUPABASE_ANON_KEY).");
  return config;
}
