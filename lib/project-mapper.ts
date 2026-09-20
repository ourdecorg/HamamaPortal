import { projectSchema } from "@/lib/schema";
import type { GeographyScope, LifecycleStage, LocalizedText, Need, Offer, Project, Steward } from "@/types/project";

/**
 * Pure mapping between the app's `Project` model (the shape of the JSON files and of everything
 * the UI/matching code reads) and the Supabase rows (see supabase/migrations).
 *
 * No I/O here on purpose: the seed script, the data layer and the tests all share it, so what is
 * imported is exactly what is read back.
 */

// ------------------------------------------------------------------- rows ---

export interface ProjectRow {
  id: string;
  slug: string;
  name: LocalizedText;
  tagline: LocalizedText;
  short_description: LocalizedText;
  vision: LocalizedText;
  problem: LocalizedText;
  desired_change: LocalizedText;
  domains: string[];
  lifecycle_stage: LifecycleStage;
  activity_status: "active" | "forming" | "paused";
  location: { scope: GeographyScope; place?: LocalizedText } | null;
  collaboration_types: string[];
  team: Steward[];
  links: { website?: string | null; linkedin?: string | null; github?: string | null };
  visibility: "public" | "unlisted" | "private";
  review_status: "draft" | "pending_review" | "published";
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NeedRow {
  id: string;
  project_id: string;
  key: string | null;
  position: number;
  type: string;
  title: LocalizedText | null;
  description: LocalizedText;
  keywords: string[];
  status: "open" | "in_conversation" | "fulfilled";
  metadata: Record<string, unknown>;
  created_at?: string;
}

export interface OfferRow extends Omit<NeedRow, "status"> {
  status: "active" | "paused";
}

export type ProjectWithItems = ProjectRow & { needs?: NeedRow[] | null; offers?: OfferRow[] | null };

/** Everything the app may write to a project as a steward (mirrors the column grant in the RLS migration). */
export const PROJECT_CONTENT_COLUMNS = [
  "name",
  "tagline",
  "short_description",
  "vision",
  "problem",
  "desired_change",
  "domains",
  "lifecycle_stage",
  "activity_status",
  "location",
  "collaboration_types",
  "team",
  "links",
] as const;

export type ProjectContentPatch = Pick<ProjectRow, (typeof PROJECT_CONTENT_COLUMNS)[number]>;

// ------------------------------------------------------- project → rows ----

export function projectContent(p: Project): ProjectContentPatch {
  return {
    name: p.name,
    tagline: p.tagline,
    short_description: p.short_description,
    vision: p.vision.future_world,
    problem: p.problem_space.primary_problem,
    desired_change: p.desired_change,
    domains: p.domains,
    lifecycle_stage: p.status.lifecycle_stage,
    activity_status: p.status.activity_status,
    location: p.geography ?? null,
    collaboration_types: p.collaboration_preferences.types,
    team: p.people.stewards,
    links: p.links,
  };
}

export type NeedInsert = Omit<NeedRow, "id" | "project_id" | "created_at">;
export type OfferInsert = Omit<OfferRow, "id" | "project_id" | "created_at">;

export function needToRow(n: Need, position: number, key: string | null = n.id): NeedInsert {
  return {
    key,
    position,
    type: n.type,
    title: n.title ?? null,
    description: n.description,
    keywords: n.keywords,
    status: n.status,
    metadata: {},
  };
}

export function offerToRow(o: Offer, position: number, key: string | null = o.id): OfferInsert {
  return {
    key,
    position,
    type: o.type,
    title: o.title ?? null,
    description: o.description,
    keywords: o.keywords,
    status: "active",
    metadata: {},
  };
}

export interface ProjectRows {
  project: Omit<ProjectRow, "id" | "created_by">;
  needs: NeedInsert[];
  offers: OfferInsert[];
}

/** What the seed script inserts for one JSON project. The JSON ids become the stable `key`s. */
export function projectToRows(p: Project): ProjectRows {
  const stamp = `${p.portal.last_updated}T00:00:00Z`;
  return {
    project: {
      slug: p.slug,
      ...projectContent(p),
      visibility: p.portal.visibility,
      review_status: p.portal.review_status,
      is_demo: p.portal.is_demo,
      created_at: stamp,
      updated_at: stamp,
    },
    needs: p.current_needs.map((n, i) => needToRow(n, i)),
    offers: p.offers.map((o, i) => offerToRow(o, i)),
  };
}

/**
 * The arguments of the `create_project` database function (see 20260920130000_create_project.sql).
 * Only content goes in: owner, publication state and ids are decided by the database, never by the caller.
 * Wizard-made needs/offers carry no `key` (that is for imported seed data), like items added on edit.
 */
export interface CreateProjectArgs {
  p_project: { slug: string } & ProjectContentPatch;
  p_needs: NeedInsert[];
  p_offers: OfferInsert[];
}

export function projectToCreateArgs(p: Project): CreateProjectArgs {
  return {
    p_project: { slug: p.slug, ...projectContent(p) },
    p_needs: p.current_needs.map((n, i) => needToRow(n, i, null)),
    p_offers: p.offers.map((o, i) => offerToRow(o, i, null)),
  };
}

// ------------------------------------------------------- rows → project ----

const byPosition = <T extends { position: number; created_at?: string }>(a: T, b: T) =>
  a.position - b.position || (a.created_at ?? "").localeCompare(b.created_at ?? "");

/**
 * Build the app's Project from a database row (with its needs and offers).
 * The result is NOT validated — the data layer runs it through `projectSchema`.
 * `id` is the database uuid; needs/offers use their database uuid as `id` too, which is what
 * opportunities reference.
 */
export function rowsToProject(row: ProjectWithItems): unknown {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    short_description: row.short_description,
    vision: { future_world: row.vision },
    problem_space: { primary_problem: row.problem },
    desired_change: row.desired_change,
    domains: row.domains,
    status: { lifecycle_stage: row.lifecycle_stage, activity_status: row.activity_status },
    ...(row.location ? { geography: row.location } : {}),
    people: { stewards: row.team ?? [] },
    current_needs: [...(row.needs ?? [])].sort(byPosition).map((n) => ({
      id: n.id,
      type: n.type,
      ...(n.title ? { title: n.title } : {}),
      description: n.description,
      keywords: n.keywords,
      status: n.status,
    })),
    offers: [...(row.offers ?? [])].sort(byPosition).map((o) => ({
      id: o.id,
      type: o.type,
      ...(o.title ? { title: o.title } : {}),
      description: o.description,
      keywords: o.keywords,
    })),
    collaboration_preferences: { types: row.collaboration_types },
    links: row.links ?? {},
    portal: {
      visibility: row.visibility,
      review_status: row.review_status,
      last_updated: row.updated_at.slice(0, 10),
      is_demo: row.is_demo,
    },
  };
}

/** Row → validated Project, or null when the row does not satisfy the schema (never throws). */
export function parseProjectRow(row: ProjectWithItems): Project | null {
  const parsed = projectSchema.safeParse(rowsToProject(row));
  return parsed.success ? parsed.data : null;
}

/** The columns a steward's edit may change on an existing need (never `key` or `metadata`). */
export function needUpdate(n: Need, position: number) {
  const { key: _key, metadata: _metadata, ...rest } = needToRow(n, position);
  void _key;
  void _metadata;
  return rest;
}

/** The same for offers; `status` is left alone so a paused offer is not silently re-activated. */
export function offerUpdate(o: Offer, position: number) {
  const { key: _key, metadata: _metadata, status: _status, ...rest } = offerToRow(o, position);
  void _key;
  void _metadata;
  void _status;
  return rest;
}
