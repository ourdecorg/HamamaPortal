import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WishRow } from "@/lib/wish";

/** My wishes, newest first (archived ones excluded). Runs with my session: Row Level Security scopes it. */
export async function listMyWishes(): Promise<WishRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("wishes")
    .select("*")
    .eq("user_id", user.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load your wishes: ${error.message}`);
  return (data ?? []) as WishRow[];
}
