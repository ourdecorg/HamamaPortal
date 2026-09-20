/**
 * Manual approval of stewardship requests (the "simple admin mechanism").
 *
 *   npm run steward:approve                                        list pending requests
 *   npm run steward:approve -- --project <slug> --email <email>    approve a request (or add a steward directly)
 *   npm run steward:approve -- --project <slug> --user <uuid> --role owner
 *   npm run steward:approve -- --project <slug> --email <email> --revoke
 *
 * Users cannot approve themselves: the app has no permission to update `project_stewards`.
 * The same can be done by hand in the Supabase SQL editor — see docs/SUPABASE.md.
 */
import { createAdminClient, flag, option } from "./lib/admin";

type Admin = ReturnType<typeof createAdminClient>;

async function usersById(admin: Admin) {
  const map = new Map<string, { email?: string; name?: string }>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      map.set(u.id, { email: u.email, name: (u.user_metadata?.full_name ?? u.user_metadata?.name) as string | undefined });
    }
    if (data.users.length < 1000) break;
  }
  return map;
}

async function main() {
  const admin = createAdminClient();
  const users = await usersById(admin);
  const slug = option("project");

  if (!slug) {
    const { data, error } = await admin
      .from("project_stewards")
      .select("user_id, role, status, created_at, project:projects(slug)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as { user_id: string; role: string; status: string; created_at: string; project: { slug: string } | null }[];
    if (!rows.length) return console.log("No stewardship requests yet.");
    console.log("project".padEnd(24), "status".padEnd(10), "role".padEnd(9), "user");
    for (const r of rows) {
      const u = users.get(r.user_id);
      console.log((r.project?.slug ?? "?").padEnd(24), r.status.padEnd(10), r.role.padEnd(9), `${u?.email ?? r.user_id}${u?.name ? ` (${u.name})` : ""}`);
    }
    return;
  }

  const email = option("email")?.toLowerCase();
  const userId = option("user") ?? [...users].find(([, u]) => u.email?.toLowerCase() === email)?.[0];
  if (!userId) throw new Error(email ? `No user with the email ${email} (they need to sign in once first).` : "Pass --email or --user.");
  const role = option("role") ?? "steward";
  if (role !== "steward" && role !== "owner") throw new Error("--role must be steward or owner.");

  const { data: project, error: pe } = await admin.from("projects").select("id, slug").eq("slug", slug).maybeSingle();
  if (pe) throw new Error(pe.message);
  if (!project) throw new Error(`No project with the slug "${slug}".`);

  if (flag("revoke")) {
    const { error } = await admin.from("project_stewards").delete().eq("project_id", project.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return console.log(`✔ Removed ${email ?? userId} from ${slug}.`);
  }

  const { error } = await admin
    .from("project_stewards")
    .upsert({ project_id: project.id, user_id: userId, role, status: "approved" }, { onConflict: "project_id,user_id" });
  if (error) throw new Error(error.message);
  console.log(`✔ ${email ?? userId} is now an approved ${role} of ${slug}.`);
}

main().catch((err) => {
  console.error(`\n✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
