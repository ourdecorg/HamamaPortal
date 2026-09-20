import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin client for the CLI scripts in /scripts ONLY (seed, steward approval).
 *
 * It uses the SERVICE ROLE key, which bypasses Row Level Security. That key must never be added to
 * the Railway service or to any client-side code: nothing in /app, /components or /lib reads it.
 * Run these scripts from a trusted machine, with the key in .env.local or the shell environment.
 */

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file); // does not override variables that are already set
  } catch {
    /* file not present */
  }
}

export function createAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error(
      "\n✖ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (put them in .env.local — never on Railway).\n" +
        "  Supabase dashboard → Project Settings → API.\n",
    );
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
