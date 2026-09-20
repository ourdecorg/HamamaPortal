"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  needToRow,
  needUpdate,
  offerToRow,
  offerUpdate,
  parseProjectRow,
  projectContent,
  type ProjectWithItems,
} from "@/lib/project-mapper";
import { projectSchema } from "@/lib/schema";
import type { ClaimState, CreateProjectResult, SaveProjectResult } from "@/lib/stewardship";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyDraft, draftSchema, prepareNewProject, validateStep, type StepId } from "@/lib/wizard";
import type { Need, Offer } from "@/types/project";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function refresh(slug: string) {
  revalidatePath("/", "layout");
  revalidatePath(`/projects/${slug}`);
}

/**
 * Publish a new project from the wizard, straight into Supabase.
 *
 * One database call: `create_project()` inserts the project, the caller's OWNER/APPROVED stewardship, the
 * Needs and the Offers in a single transaction (nothing is left behind if any part fails) and picks a free
 * slug. The client only sends the wizard draft: the owner is the session user (`auth.uid()` inside the
 * function), and the slug, visibility and publication state are never taken from the draft.
 * Claiming an EXISTING project is a different path (`claimProject`): pending, approved by an admin.
 */
export async function createProject(rawDraft: unknown): Promise<CreateProjectResult> {
  if (!isSupabaseConfigured()) return { status: "error", error: "השמירה לא זמינה במצב הדגמה." };
  const user = await getCurrentUser();
  if (!user) return { status: "auth_required" };

  const prepared = prepareNewProject(rawDraft);
  if (!prepared.ok) return { status: "error", error: prepared.error };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_project", prepared.args);
  if (error) {
    // 28000 / 42501: the session is gone or the role is not allowed to call the function.
    if (error.code === "28000" || error.code === "42501") return { status: "auth_required" };
    console.error("[hamama] createProject failed:", error.code, error.message);
    return { status: "error", error: "לא הצלחנו ליצור את המיזם. לא נשמר דבר — אפשר לנסות שוב." };
  }

  const slug = (data as { slug?: unknown } | null)?.slug;
  if (typeof slug !== "string" || !SLUG.test(slug)) {
    console.error("[hamama] createProject: unexpected response", data);
    return { status: "error", error: "לא הצלחנו ליצור את המיזם. נסו שוב." };
  }
  refresh(slug);
  revalidatePath("/my-space");
  return { status: "created", slug };
}

/**
 * "אני מטפח/ת את המיזם הזה": ask to become a steward.
 * Creates ONE row for the signed-in user with status `pending`. Nobody becomes an owner or an
 * approved steward this way: an admin approves (npm run steward:approve), and the database refuses
 * any other status or role from this user (see the RLS migration).
 */
export async function claimProject(slug: string): Promise<ClaimState> {
  if (!isSupabaseConfigured() || !SLUG.test(slug)) return { status: "error", error: "הבקשה לא תקינה." };
  const user = await getCurrentUser();
  if (!user) return { status: "auth_required" };

  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase.from("projects").select("id").eq("slug", slug).maybeSingle();
  if (!project) return { status: "error", error: "המיזם לא נמצא." };

  const { error } = await supabase.from("project_stewards").insert({ project_id: project.id, user_id: user.id });
  // 23505 = already asked. The request exists, which is what the person wanted.
  if (error && error.code !== "23505") {
    console.error("[hamama] claimProject failed:", error.message);
    return { status: "error", error: "לא הצלחנו לשלוח את הבקשה. נסו שוב." };
  }
  refresh(slug);
  revalidatePath("/my-space");
  return { status: "requested" };
}

/** Take back a request that has not been approved yet (the database only allows deleting pending rows). */
export async function withdrawClaim(slug: string): Promise<void> {
  if (!isSupabaseConfigured() || !SLUG.test(slug)) return;
  const user = await getCurrentUser();
  if (!user) return;

  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase.from("projects").select("id").eq("slug", slug).maybeSingle();
  if (!project) return;
  await supabase.from("project_stewards").delete().eq("project_id", project.id).eq("user_id", user.id).eq("status", "pending");
  refresh(slug);
  revalidatePath("/my-space");
}

/**
 * Save a steward's edits: project details, activity status, Needs and Offers.
 *
 * Authorisation is enforced twice: here (an approved stewardship for the session user) and by Row Level
 * Security on every statement below, which runs with the user's own JWT. The client only sends the wizard
 * draft; identity, slug and moderation state are never taken from it.
 */
export async function saveProjectEdits(slug: string, rawDraft: unknown): Promise<SaveProjectResult> {
  if (!isSupabaseConfigured() || !SLUG.test(slug)) return { status: "error", error: "הבקשה לא תקינה." };
  const user = await getCurrentUser();
  if (!user) return { status: "auth_required" };

  const draft = draftSchema.safeParse(rawDraft);
  if (!draft.success) return { status: "error", error: "חלק מהשדות ארוכים מדי או לא תקינים." };
  for (const step of ["identity", "intent", "details"] as StepId[]) {
    const problems = Object.values(validateStep(step, { ...draft.data, slug }));
    if (problems.length) return { status: "error", error: problems[0] };
  }

  const supabase = await createSupabaseServerClient();
  const { data: row } = await supabase.from("projects").select("*, needs(*), offers(*)").eq("slug", slug).maybeSingle();
  if (!row) return { status: "forbidden" };
  const original = parseProjectRow(row as ProjectWithItems);
  if (!original) return { status: "error", error: "לא הצלחנו לקרוא את המיזם הקיים." };

  const { data: steward } = await supabase
    .from("project_stewards")
    .select("status")
    .eq("project_id", original.id)
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();
  if (!steward) return { status: "forbidden" };

  const next = projectSchema.safeParse(applyDraft(original, draft.data));
  if (!next.success) {
    const issue = next.error.issues[0];
    return { status: "error", error: `${issue?.path.join(".") || "המיזם"}: ${issue?.message ?? "לא תקין"}` };
  }
  const edited = next.data;

  // 1. The project itself. Row Level Security only lets an approved steward's UPDATE match a row.
  const { data: updated, error: projectError } = await supabase
    .from("projects")
    .update(projectContent(edited))
    .eq("id", original.id)
    .select("id");
  if (projectError) {
    console.error("[hamama] saveProjectEdits (project):", projectError.message);
    return { status: "error", error: "השמירה נכשלה. נסו שוב." };
  }
  if (!updated?.length) return { status: "forbidden" };

  // 2. Needs and offers.
  try {
    await syncItems(supabase, "needs", original.id, original.current_needs, edited.current_needs, needToRow, needUpdate);
    await syncItems(supabase, "offers", original.id, original.offers, edited.offers, offerToRow, offerUpdate);
  } catch (err) {
    console.error("[hamama] saveProjectEdits (items):", err);
    return { status: "error", error: "פרטי המיזם נשמרו, אבל הצרכים או ההצעות לא נשמרו במלואם. נסו לשמור שוב." };
  }

  refresh(slug);
  revalidatePath("/my-space");
  return { status: "saved" };
}

/**
 * Bring the stored needs/offers in line with the edited list: update what changed (identity is kept, so
 * opportunities that point at a need keep pointing at it), insert what is new, delete what was removed.
 */
async function syncItems<T extends Need | Offer>(
  supabase: Supabase,
  table: "needs" | "offers",
  projectId: string,
  before: T[],
  after: T[],
  toRow: (item: T, position: number, key: string | null) => object,
  toUpdate: (item: T, position: number) => object,
) {
  const known = new Map(before.map((item, i) => [item.id, { item, position: i }]));
  const keep = new Set<string>();

  for (const [position, item] of after.entries()) {
    const prior = known.get(item.id);
    if (prior) {
      keep.add(item.id);
      const changed = JSON.stringify(toUpdate(item, position)) !== JSON.stringify(toUpdate(prior.item, prior.position));
      if (!changed) continue;
      const { error } = await supabase.from(table).update(toUpdate(item, position)).eq("id", item.id);
      if (error) throw new Error(`${table} update: ${error.message}`);
    } else {
      const { error } = await supabase.from(table).insert({ ...toRow(item, position, null), project_id: projectId });
      if (error) throw new Error(`${table} insert: ${error.message}`);
    }
  }

  const removed = before.filter((item) => !keep.has(item.id)).map((item) => item.id);
  if (removed.length) {
    const { error } = await supabase.from(table).delete().in("id", removed);
    if (error) throw new Error(`${table} delete: ${error.message}`);
  }
}
