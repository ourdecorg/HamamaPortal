import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import type { Connection } from "@/lib/matching";
import { connectionKey, type MyOpportunity, type OpportunityRow } from "@/lib/opportunity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Opportunity queries. They run with the current user's session: Row Level Security scopes them. */

/** Every opportunity I asked for, newest first. */
export async function listMyOpportunities(): Promise<OpportunityRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("requested_by", user.id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Could not load your connections: ${error.message}`);
  return (data ?? []) as OpportunityRow[];
}

/** My opportunities indexed by connection — one query per request, however many cards are on the page. */
const myOpportunityIndex = cache(async (): Promise<Map<string, MyOpportunity>> => {
  const index = new Map<string, MyOpportunity>();
  for (const o of await listMyOpportunities()) {
    if (o.source_entity_type !== "project" || o.target_entity_type !== "project") continue;
    index.set(
      connectionKey({ source: o.source_entity_id, target: o.target_entity_id, need: o.need_id, offer: o.offer_id }),
      { id: o.id, status: o.status },
    );
  }
  return index;
});

export function keyOfConnection(c: Connection): string {
  return connectionKey({ source: c.project_a.id, target: c.project_b.id, need: c.need.id, offer: c.offer.id });
}

/** My opportunity for this connection, if I already chose to advance it. */
export async function getMyOpportunityFor(c: Connection): Promise<MyOpportunity | null> {
  return (await myOpportunityIndex()).get(keyOfConnection(c)) ?? null;
}
