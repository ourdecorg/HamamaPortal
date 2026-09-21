/** Opportunity vocabulary and result shapes. Pure — safe to import from client components. */

export type OpportunityStatus = "suggested" | "interested" | "intro_requested" | "in_progress" | "closed";

export const OPPORTUNITY_STATUS: Record<OpportunityStatus, { label: string; hint: string }> = {
  suggested: { label: "הוצע", hint: "המערכת זיהתה את החיבור. עוד לא הגבתם." },
  interested: { label: "רוצים לקדם", hint: "סימנתם שאתם רוצים לקדם. הצעד הבא הוא שלכם: היכרות, בירור או שיחה קצרה." },
  intro_requested: { label: "ביקשתם היכרות", hint: "אתם מכינים היכרות. החממה לא שולחת דבר — ההודעה יוצאת רק מכם." },
  in_progress: { label: "בתהליך", hint: "הצדדים כבר בשיחה." },
  closed: { label: "נסגר", hint: "לא מקדמים את החיבור הזה כרגע." },
};

export interface OpportunityRow {
  id: string;
  source_entity_type: "project" | "wish";
  source_entity_id: string;
  target_entity_type: "project" | "wish";
  target_entity_id: string;
  need_id: string | null;
  offer_id: string | null;
  rationale: string;
  unknowns: string[];
  confidence: number | null;
  status: OpportunityStatus;
  requested_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** What the connection card needs to know about "my" opportunity for it. */
export interface MyOpportunity {
  id: string;
  status: OpportunityStatus;
}

export type AdvanceResult =
  | { status: "ok"; opportunity: MyOpportunity }
  | { status: "auth_required" }
  | { status: "error"; error: string };

export type StatusChangeResult =
  | { status: "ok"; opportunity: MyOpportunity }
  | { status: "error"; error: string };

/** Identity of a connection between two projects through one need and one offer. */
export function connectionKey(parts: { source: string; target: string; need: string | null; offer: string | null }): string {
  return [parts.source, parts.target, parts.need ?? "", parts.offer ?? ""].join(":");
}
