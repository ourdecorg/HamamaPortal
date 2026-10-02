import { getCurrentUser } from "@/lib/auth";
import type { ConversationSummary, PersonContact } from "@/lib/conversation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Reading who can be contacted, and your own correspondence. Server-only. Everything runs with the CURRENT
 * USER's session through the database functions of 20260929120000_contacts.sql, which decide what comes back:
 * visitors learn whether a team member is contactable and registered — never an address.
 */

/** How each contactable person on a visible project's team can be reached, by person id. */
export async function getProjectPeople(projectId: string): Promise<Record<string, PersonContact>> {
  if (!isSupabaseConfigured()) return {};
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("project_people", { p_project_id: projectId });
  if (error) {
    console.error("[hamama] project_people failed:", error.message);
    return {};
  }
  const out: Record<string, PersonContact> = {};
  for (const row of (data ?? []) as { person_id: string; registered: boolean; contactable: boolean; is_me: boolean }[]) {
    out[row.person_id] = { registered: row.registered, contactable: row.contactable, isMe: row.is_me };
  }
  return out;
}

/** The team's emails, for the edit form. Only a project's approved stewards and admins get any. */
export async function getProjectContactEmails(projectId: string): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) return {};
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("project_contact_emails", { p_project_id: projectId });
  if (error) throw new Error(`Could not load the team's emails: ${error.message}`);
  return Object.fromEntries(((data ?? []) as { person_id: string; email: string }[]).map((r) => [r.person_id, r.email]));
}

/** The signed-in person's conversations, newest first. */
export async function listMyConversations(): Promise<ConversationSummary[]> {
  if (!isSupabaseConfigured() || !(await getCurrentUser())) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_conversations");
  if (error) throw new Error(`Could not load your correspondence: ${error.message}`);
  return (data ?? []) as ConversationSummary[];
}
