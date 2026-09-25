import { getCurrentUser } from "@/lib/auth";
import { parseProjectRow, type ProjectWithItems } from "@/lib/project-mapper";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Project } from "@/types/project";

/**
 * Who looks after which project. Every query here runs with the CURRENT USER's session, so Row Level
 * Security — not this code — decides what comes back.
 *
 * Roles: owner | steward.  Status: pending (asked, not yet approved by an admin) | approved.
 * Only APPROVED stewards may edit (see is_project_editor() in the migrations).
 */

export type StewardRole = "owner" | "steward";
export type StewardStatus = "pending" | "approved";

export interface MyStewardship {
  role: StewardRole;
  status: StewardStatus;
}

const PROJECT_SELECT = "*, needs(*), offers(*)";

/** My stewardship of one project, or null if I have not asked. */
export async function getMyStewardship(projectId: string): Promise<MyStewardship | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("project_stewards")
    .select("role, status")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as MyStewardship | null) ?? null;
}

/** Every project I am (or asked to be) a steward of, including drafts that only stewards can see. */
export async function listMyStewardships(): Promise<(MyStewardship & { project: Project })[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_stewards")
    .select(`role, status, project:projects(${PROJECT_SELECT})`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load your projects: ${error.message}`);

  const out: (MyStewardship & { project: Project })[] = [];
  for (const row of (data ?? []) as unknown as (MyStewardship & { project: (ProjectWithItems & { deleted_at?: string | null }) | null })[]) {
    // Admins can read deleted projects (to restore them); they do not belong in anyone's own list.
    if (row.project?.deleted_at) continue;
    const project = row.project ? parseProjectRow(row.project) : null;
    if (project) out.push({ role: row.role, status: row.status, project });
  }
  return out;
}

/** Result shapes of the stewardship server actions (kept here: "use server" files export functions only). */
export type ClaimState =
  | { status: "idle" }
  | { status: "requested" }
  | { status: "auth_required" }
  | { status: "error"; error: string };

export type SaveProjectResult =
  | { status: "saved" }
  | { status: "auth_required" }
  | { status: "forbidden" }
  | { status: "error"; error: string };

export type CreateProjectResult =
  | { status: "created"; slug: string }
  | { status: "auth_required" }
  | { status: "error"; error: string };

/**
 * The project as its steward sees it (drafts and private projects included), or null when the
 * current user cannot see it. Editing is additionally gated on an approved stewardship.
 */
export async function getProjectForEditing(slug: string): Promise<{ project: Project; stewardship: MyStewardship | null } | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("projects").select(PROJECT_SELECT).eq("slug", slug).maybeSingle();
  const project = data ? parseProjectRow(data as ProjectWithItems) : null;
  if (!project) return null;
  return { project, stewardship: await getMyStewardship(project.id) };
}
