import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { loginUrl } from "@/lib/next-path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in user, derived from the Supabase session cookie and VERIFIED with Supabase Auth
 * (`getUser`, not the unverified cookie). This is the only source of "who is this" — no user id is
 * ever taken from a form field or a request body.
 *
 * Memoised per request. Returns null for visitors, and always null when Supabase is not configured.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
});

export { loginUrl, safeNext } from "@/lib/next-path";

export function displayNameOf(user: User): string {
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  return meta?.full_name || meta?.name || user.email?.split("@")[0] || "חבר/ה";
}

/** For pages that need a signed-in user: sends visitors to /login and brings them back afterwards. */
export async function requireUser(next: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl(next));
  return user;
}
