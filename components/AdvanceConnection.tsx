import { AdvanceConnectionPanel } from "@/components/AdvanceConnectionPanel";
import { IntroDraft } from "@/components/IntroDraft";
import { getCurrentUser } from "@/lib/auth";
import type { Connection } from "@/lib/matching";
import { getMyOpportunityFor } from "@/lib/opportunity-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * The action area of a fully-expanded connection card.
 * Persistence available (Supabase configured): the "advance this connection" call to action.
 * Demo mode: the original behaviour — just the editable introduction draft.
 */
export async function AdvanceConnection({ connection }: { connection: Connection }) {
  if (!isSupabaseConfigured()) return <IntroDraft connection={connection} />;

  const user = await getCurrentUser();
  const mine = user ? await getMyOpportunityFor(connection) : null;
  return <AdvanceConnectionPanel connection={connection} signedIn={Boolean(user)} initial={mine} />;
}
