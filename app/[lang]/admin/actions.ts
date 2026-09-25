"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isCurrentUserAdmin, type AdminActionResult, type UserSearchResult } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { actionMessages } from "@/lib/i18n/action-locale";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The admin area's server actions. Each one first asks the database whether the caller is an active admin
 * right now (so a revoked admin is refused on their next request), and then calls a database function that
 * checks the same thing again — calling these actions, or the database, directly gets a non-admin nowhere.
 * The safeguards (never zero admins, no duplicate grants, known users only) live in the database too.
 */

type Messages = ReturnType<typeof actionMessages>;

const uuid = z.uuid();

function refresh() {
  revalidatePath("/", "layout");
}

/** A database error as a message in the admin's language. The codes are raised in the admin migration. */
function explain(error: { code?: string; message: string }, m: Messages["admin"]["errors"]): string {
  switch (error.code) {
    case "42501":
    case "28000":
      return m.forbidden;
    case "HA001":
      return m.noUser;
    case "HA002":
      return m.alreadyAdmin;
    case "HA003":
      return m.notAdmin;
    case "HA004":
      return m.lastAdmin;
    case "HA005":
      return m.projectGone;
    case "23514":
    case "22P02":
      return m.invalid;
    default:
      console.error("[hamama] admin action failed:", error.code, error.message);
      return m.failed;
  }
}

/** The caller's Supabase session, if (and only if) they are an active admin. */
async function adminSession(localeArg: string) {
  const m = actionMessages(localeArg).admin.errors;
  if (!isSupabaseConfigured() || !(await getCurrentUser()) || !(await isCurrentUserAdmin())) {
    return { ok: false as const, m, result: { status: "error", error: m.forbidden } as const };
  }
  return { ok: true as const, m, supabase: await createSupabaseServerClient() };
}

async function call(localeArg: string, fn: string, args: Record<string, unknown>): Promise<AdminActionResult> {
  const session = await adminSession(localeArg);
  if (!session.ok) return session.result;
  const { error } = await session.supabase.rpc(fn, args);
  if (error) return { status: "error", error: explain(error, session.m) };
  refresh();
  return { status: "ok" };
}

// ---------------------------------------------------------------- projects ---

const reviewStatus = z.enum(["draft", "pending_review", "published"]);
const visibility = z.enum(["public", "unlisted", "private"]);

export async function setProjectState(projectId: string, review: string, vis: string, localeArg: string): Promise<AdminActionResult> {
  const parsed = z.tuple([uuid, reviewStatus, visibility]).safeParse([projectId, review, vis]);
  if (!parsed.success) return { status: "error", error: actionMessages(localeArg).admin.errors.invalid };
  return call(localeArg, "admin_set_project_state", {
    p_project_id: parsed.data[0],
    p_review_status: parsed.data[1],
    p_visibility: parsed.data[2],
  });
}

/**
 * Soft-delete a project. The admin must type the project's slug; that confirmation is checked here, on the
 * server, against the stored slug — not only in the dialog.
 */
export async function deleteProject(projectId: string, typedSlug: string, localeArg: string): Promise<AdminActionResult> {
  const session = await adminSession(localeArg);
  if (!session.ok) return session.result;
  if (!uuid.safeParse(projectId).success) return { status: "error", error: session.m.invalid };

  const { data } = await session.supabase.from("projects").select("slug").eq("id", projectId).maybeSingle();
  if (!data) return { status: "error", error: session.m.projectGone };
  if (typeof typedSlug !== "string" || typedSlug.trim() !== data.slug) return { status: "error", error: session.m.confirmMismatch };

  const { error } = await session.supabase.rpc("admin_delete_project", { p_project_id: projectId });
  if (error) return { status: "error", error: explain(error, session.m) };
  refresh();
  return { status: "ok" };
}

export async function restoreProject(projectId: string, localeArg: string): Promise<AdminActionResult> {
  if (!uuid.safeParse(projectId).success) return { status: "error", error: actionMessages(localeArg).admin.errors.invalid };
  return call(localeArg, "admin_restore_project", { p_project_id: projectId });
}

// ------------------------------------------------------------------ admins ---

/** Registered people by email or name, to choose a new admin from. */
export async function searchUsers(query: string, localeArg: string): Promise<UserSearchResult> {
  const session = await adminSession(localeArg);
  if (!session.ok) return session.result;
  const q = typeof query === "string" ? query.trim().slice(0, 200) : "";
  if (q.length < 2) return { status: "ok", users: [] };

  const { data, error } = await session.supabase.rpc("admin_search_users", { p_query: q });
  if (error) return { status: "error", error: explain(error, session.m) };
  const rows = (data ?? []) as { user_id: string; email: string | null; display_name: string | null; is_admin: boolean }[];
  return {
    status: "ok",
    users: rows.map((r) => ({ userId: r.user_id, email: r.email, name: r.display_name, isAdmin: r.is_admin })),
  };
}

/** Make an existing user an admin. The database records who granted it and when. */
export async function grantAdmin(userId: string, localeArg: string): Promise<AdminActionResult> {
  if (!uuid.safeParse(userId).success) return { status: "error", error: actionMessages(localeArg).admin.errors.invalid };
  return call(localeArg, "admin_grant", { p_user_id: userId });
}

/**
 * Revoke someone's admin access (possibly your own). Only the privilege goes; the account stays. The
 * database refuses when it would leave no active admin, and records who revoked it and when.
 */
export async function revokeAdmin(userId: string, localeArg: string): Promise<AdminActionResult> {
  if (!uuid.safeParse(userId).success) return { status: "error", error: actionMessages(localeArg).admin.errors.invalid };
  return call(localeArg, "admin_revoke", { p_user_id: userId });
}
