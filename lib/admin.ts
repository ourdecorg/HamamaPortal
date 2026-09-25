import { cache } from "react";
import { notFound } from "next/navigation";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { parseProjectRow, type ProjectWithItems } from "@/lib/project-mapper";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Project } from "@/types/project";

/**
 * The admin area's server side. Who is an admin lives in the database (public.admin_users); this module only
 * ASKS the database, with the current person's own session — it never decides on its own and never uses the
 * service-role key. The database functions check admin status again on every privileged call
 * (see supabase/migrations/20260925120000_admin.sql), so a page or action that forgot to check would still
 * be refused.
 */

/** Is the signed-in person an active admin right now? Asked once per request; false in demo mode. */
export const isCurrentUserAdmin = cache(async (): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error) {
    console.error("[hamama] is_admin failed:", error.message);
    return false;
  }
  return data === true;
});

/**
 * For admin pages: visitors are sent to sign in; signed-in people who are not admins get a plain 404, so the
 * admin area does not even reveal that it exists.
 */
export async function requireAdminPage(next: string) {
  if (!isSupabaseConfigured()) notFound();
  const user = await requireUser(next);
  if (!(await isCurrentUserAdmin())) notFound();
  return user;
}

// ------------------------------------------------------------------ admins ---

export interface AdminGrant {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  grantedAt: string;
  grantedBy: { id: string | null; email: string | null; name: string | null } | null;
  revokedAt: string | null;
  revokedBy: { id: string | null; email: string | null; name: string | null } | null;
}

interface AdminListRow {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  granted_at: string;
  granted_by: string | null;
  granted_by_email: string | null;
  granted_by_name: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_by_email: string | null;
  revoked_by_name: string | null;
}

/** Every admin grant, active first — the admin list and its history. */
export async function listAdminGrants(): Promise<AdminGrant[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list");
  if (error) throw new Error(`Could not load the admin list: ${error.message}`);
  return ((data ?? []) as AdminListRow[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    email: r.email,
    name: r.display_name,
    grantedAt: r.granted_at,
    grantedBy: r.granted_by || r.granted_by_email ? { id: r.granted_by, email: r.granted_by_email, name: r.granted_by_name } : null,
    revokedAt: r.revoked_at,
    revokedBy: r.revoked_at ? { id: r.revoked_by, email: r.revoked_by_email, name: r.revoked_by_name } : null,
  }));
}

export interface UserMatch {
  userId: string;
  email: string | null;
  name: string | null;
  isAdmin: boolean;
}

// ---------------------------------------------------------------- projects ---

export interface AdminProject {
  project: Project;
  deletedAt: string | null;
  createdAt: string;
}

/** Every project, including drafts, private and deleted ones (Row Level Security lets admins see them). */
export async function listAllProjects(): Promise<AdminProject[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, needs(*), offers(*)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Could not load projects: ${error.message}`);
  const out: AdminProject[] = [];
  for (const row of (data ?? []) as (ProjectWithItems & { deleted_at: string | null })[]) {
    const project = parseProjectRow(row);
    if (project) out.push({ project, deletedAt: row.deleted_at, createdAt: row.created_at });
    else console.warn(`[hamama] admin: skipped malformed project ${row.slug}`);
  }
  return out;
}

export async function getProjectForAdmin(slug: string): Promise<AdminProject | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("projects").select("*, needs(*), offers(*)").eq("slug", slug).maybeSingle();
  if (!data) return null;
  const row = data as ProjectWithItems & { deleted_at: string | null };
  const project = parseProjectRow(row);
  return project ? { project, deletedAt: row.deleted_at, createdAt: row.created_at } : null;
}

// ------------------------------------------------------- action results ---

/** Results of the admin server actions (kept here: "use server" files export functions only). */
export type AdminActionResult = { status: "ok" } | { status: "error"; error: string };
export type UserSearchResult = { status: "ok"; users: UserMatch[] } | { status: "error"; error: string };
