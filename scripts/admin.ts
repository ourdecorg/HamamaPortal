/**
 * Administrators from the command line — how the FIRST admin is created (after that, admins add each other in
 * the portal at /admin/admins).
 *
 *   npm run admin                                   list admins (active and revoked)
 *   npm run admin -- --grant --email you@example.com
 *   npm run admin -- --grant --user <uuid>
 *   npm run admin -- --revoke --email someone@example.com
 *
 * Uses the service-role key, so it only runs from a trusted machine (.env.local) — never on Railway. The person
 * must have signed in to the portal once, so that their account exists. Grants made here are recorded with
 * granted_by = null ("initial setup"). The database refuses to revoke the last active admin, here too.
 * The same can be done in the Supabase SQL editor — see docs/SUPABASE.md.
 */
import { createAdminClient, flag, option } from "./lib/admin";

type Admin = ReturnType<typeof createAdminClient>;

async function allUsers(admin: Admin) {
  const users: { id: string; email?: string }[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email })));
    if (data.users.length < 1000) break;
  }
  return users;
}

async function main() {
  const admin = createAdminClient();
  const users = await allUsers(admin);
  const emailOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.email ?? id) : "initial setup");

  const grant = flag("grant");
  const revoke = flag("revoke");
  if (!grant && !revoke) {
    const { data, error } = await admin
      .from("admin_users")
      .select("user_id, granted_at, granted_by, revoked_at, revoked_by")
      .order("granted_at");
    if (error) throw new Error(error.message);
    if (!data?.length) return console.log("No admins yet. Create the first one with: npm run admin -- --grant --email you@example.com");
    for (const r of data) {
      const state = r.revoked_at ? `revoked ${r.revoked_at.slice(0, 10)} by ${emailOf(r.revoked_by)}` : "ACTIVE";
      console.log(`${emailOf(r.user_id).padEnd(36)} ${state.padEnd(40)} granted ${r.granted_at.slice(0, 10)} by ${emailOf(r.granted_by)}`);
    }
    return;
  }

  const email = option("email")?.toLowerCase();
  const userId = option("user") ?? users.find((u) => u.email?.toLowerCase() === email)?.id;
  if (!userId) throw new Error(email ? `No user with the email ${email} (they need to sign in to the portal once first).` : "Pass --email or --user.");
  const label = email ?? userId;

  if (grant) {
    const { data: active } = await admin.from("admin_users").select("id").eq("user_id", userId).is("revoked_at", null).maybeSingle();
    if (active) return console.log(`${label} is already an admin.`);
    const { error } = await admin.from("admin_users").insert({ user_id: userId });
    if (error) throw new Error(error.message);
    return console.log(`✔ ${label} is now an admin. They will see "Admin" in the header on their next page load.`);
  }

  const { data: updated, error } = await admin
    .from("admin_users")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");
  if (error) throw new Error(error.code === "HA004" ? "That is the last active admin — add another admin first." : error.message);
  console.log(updated?.length ? `✔ Admin access revoked for ${label}. The account itself is untouched.` : `${label} is not an active admin.`);
}

main().catch((err) => {
  console.error(`\n✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
