import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { requireSupabaseConfig } from "@/lib/supabase/config";

/** Server-side data must never be served from a stale HTTP cache. */
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

/**
 * Supabase client bound to the CURRENT USER's session (cookies).
 * Every query runs with the user's JWT, so Row Level Security decides what it can see and change.
 * Use it for anything that belongs to, or is authorised by, the signed-in user.
 * Server Components, Server Actions and Route Handlers only.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    global: { fetch: noStoreFetch },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, which cannot set cookies.
          // proxy.ts refreshes the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Anonymous client: no cookies, no session. Used for the public catalogue (projects, needs, offers)
 * so public pages never depend on who is looking. RLS still applies (role `anon`).
 */
export function createPublicClient(): SupabaseClient {
  const { url, anonKey } = requireSupabaseConfig();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: noStoreFetch },
  });
}
