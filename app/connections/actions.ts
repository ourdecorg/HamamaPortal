"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import type { Connection } from "@/lib/matching";
import type { AdvanceResult, MyOpportunity, OpportunityStatus, StatusChangeResult } from "@/lib/opportunity";
import { getConnections } from "@/lib/projects";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const connectionIdSchema = z.string().max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*--[a-z0-9]+(-[a-z0-9]+)*$/);
const uuidSchema = z.string().uuid();

/** The explanation stored with the opportunity: why it was suggested, in plain text. */
function rationaleOf(c: Connection): string {
  return [c.summary, ...c.reasons.map((r) => (r.tags?.length ? `${r.text} ${r.tags.join(", ")}` : r.text))].join("\n");
}

/**
 * "אני רוצה לקדם את החיבור הזה".
 *
 * Persists (or updates) the Opportunity for this connection and this person, as `interested`.
 *  - The connection is looked up HERE from the matching engine by its public id; the client sends nothing
 *    but that id, so it cannot invent needs, offers or projects.
 *  - The requesting user is the session user, never a value from the client.
 *  - Nothing is sent to anybody. A human decides what happens next.
 * One row per person per connection: pressing it again is harmless and never downgrades a later status.
 */
export async function advanceConnection(connectionId: string): Promise<AdvanceResult> {
  if (!isSupabaseConfigured()) return { status: "error", error: "השמירה עדיין לא הוגדרה בשרת הזה." };
  const user = await getCurrentUser();
  if (!user) return { status: "auth_required" };

  const id = connectionIdSchema.safeParse(connectionId);
  if (!id.success) return { status: "error", error: "החיבור לא תקין." };

  const connection = (await getConnections()).find((c) => c.id === id.data);
  if (!connection) return { status: "error", error: "החיבור הזה כבר לא מופיע — ייתכן שהצרכים או ההצעות התעדכנו." };

  const supabase = await createSupabaseServerClient();
  const find = () =>
    supabase
      .from("opportunities")
      .select("id, status")
      .eq("source_entity_type", "project")
      .eq("source_entity_id", connection.project_a.id)
      .eq("target_entity_type", "project")
      .eq("target_entity_id", connection.project_b.id)
      .eq("need_id", connection.need.id)
      .eq("offer_id", connection.offer.id)
      .eq("requested_by", user.id)
      .maybeSingle();

  let existing = (await find()).data as MyOpportunity | null;

  if (!existing) {
    const { data, error } = await supabase
      .from("opportunities")
      .insert({
        source_entity_type: "project",
        source_entity_id: connection.project_a.id, // the project with the need
        target_entity_type: "project",
        target_entity_id: connection.project_b.id, // the project with the offer
        need_id: connection.need.id,
        offer_id: connection.offer.id,
        rationale: rationaleOf(connection),
        unknowns: connection.unknowns,
        confidence: connection.confidence,
        status: "interested",
        requested_by: user.id,
        created_by: user.id,
      })
      .select("id, status")
      .single();

    if (error?.code === "23505") {
      existing = (await find()).data as MyOpportunity | null; // a double click won the race
    } else if (error || !data) {
      console.error("[hamama] advanceConnection failed:", error?.message);
      return { status: "error", error: "לא הצלחנו לשמור את החיבור. נסו שוב." };
    } else {
      existing = data as MyOpportunity;
    }
  } else if (existing.status === "closed") {
    // Changed my mind: reopen it.
    const { data } = await supabase.from("opportunities").update({ status: "interested" }).eq("id", existing.id).select("id, status").single();
    if (data) existing = data as MyOpportunity;
  }

  if (!existing) return { status: "error", error: "לא הצלחנו לשמור את החיבור. נסו שוב." };
  revalidatePath("/my-space");
  return { status: "ok", opportunity: existing };
}

async function changeStatus(id: string, to: OpportunityStatus, from: OpportunityStatus[]): Promise<StatusChangeResult> {
  if (!isSupabaseConfigured() || !(await getCurrentUser())) return { status: "error", error: "צריך להיכנס כדי להמשיך." };
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { status: "error", error: "החיבור לא תקין." };

  // Row Level Security only lets me touch my own opportunity, and only its status.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ status: to })
    .eq("id", parsed.data)
    .in("status", from)
    .select("id, status")
    .maybeSingle();
  if (error || !data) return { status: "error", error: "לא הצלחנו לעדכן את החיבור." };
  revalidatePath("/my-space");
  return { status: "ok", opportunity: data as MyOpportunity };
}

/**
 * "בקשת היכרות": records that I intend to ask for an introduction. It does NOT contact anyone —
 * the person copies the drafted message and sends it themselves.
 */
export async function requestIntroduction(opportunityId: string): Promise<StatusChangeResult> {
  return changeStatus(opportunityId, "intro_requested", ["interested", "intro_requested"]);
}

/** "לא מקדמים כרגע": close one of my own opportunities. */
export async function closeOpportunity(opportunityId: string): Promise<void> {
  await changeStatus(opportunityId, "closed", ["interested", "intro_requested"]);
}
