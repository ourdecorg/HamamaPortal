/**
 * Administrators and project administration — against real Postgres (PGlite) with the real migrations,
 * as Supabase applies them (role + JWT subject, Row Level Security, grants).
 *
 *   npx tsx --test tests/admin.test.ts
 *
 * Everything here is enforced by the DATABASE: a non-admin calling these functions directly (which anyone
 * with a session could do) is refused, and the "never zero admins" rule holds even for the SQL editor.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createMigratedDb } from "./helpers/pg";

const ROOT = "00000000-0000-4000-8000-0000000000a1"; // the bootstrap admin
const ADA = "00000000-0000-4000-8000-0000000000a2";
const BEN = "00000000-0000-4000-8000-0000000000a3"; // a steward, never an admin
const NOBODY = "00000000-0000-4000-8000-0000000000ff";

const P_LIVE = "10000000-0000-4000-8000-0000000000a1";
const P_DRAFT = "10000000-0000-4000-8000-0000000000a2";

const text = (he: string) => JSON.stringify({ translations: { he } });

let db: PGlite;
const rows = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows;
const as = <T>(user: string | null, fn: () => Promise<T>) => asUser(db, user, fn);
const isAdmin = async (user: string) => (await as(user, () => rows("select public.is_admin() as a")))[0].a;

/** The SQLSTATE a statement fails with (or null when it succeeds). */
async function failure(user: string | null, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await as(user, () => db.query(sql, params));
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? "unknown";
  }
}

before(async () => {
  db = await createMigratedDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ROOT}', 'root@example.com', '{"full_name": "Root"}'),
      ('${ADA}',  'ada@example.com',  '{"full_name": "Ada Lovelace"}'),
      ('${BEN}',  'ben@example.com',  '{"name": "Ben"}');

    insert into public.projects (id, slug, name, tagline, short_description, vision, problem, desired_change,
                                 domains, lifecycle_stage, review_status, visibility) values
      ('${P_LIVE}',  'live-one',  '${text("חי")}',    '${text("t")}', '${text("s")}', '${text("v")}', '${text("p")}', '${text("d")}', '{community}', 'pilot', 'published', 'public'),
      ('${P_DRAFT}', 'draft-one', '${text("טיוטה")}', '${text("t")}', '${text("s")}', '${text("v")}', '${text("p")}', '${text("d")}', '{community}', 'idea',  'draft',     'public');

    insert into public.needs (project_id, key, type, description) values ('${P_LIVE}', 'need-1', 'community', '${text("צורך")}');
    insert into public.project_stewards (project_id, user_id, role, status) values ('${P_LIVE}', '${BEN}', 'owner', 'approved');

    -- Bootstrap, exactly as documented: one insert from a trusted connection (SQL editor / service role).
    insert into public.admin_users (user_id) values ('${ROOT}');
  `);
});

after(async () => {
  await db.close();
});

describe("who is an admin", () => {
  it("is decided by an active row in admin_users", async () => {
    assert.equal(await isAdmin(ROOT), true);
    assert.equal(await isAdmin(ADA), false);
    assert.equal((await as(null, () => rows("select public.is_admin() as a")))[0].a, false, "visitors are never admins");
  });

  it("cannot be read or changed through the table by a normal session", async () => {
    assert.equal(await failure(BEN, "select * from public.admin_users"), "42501");
    assert.equal(await failure(BEN, `insert into public.admin_users (user_id) values ('${BEN}')`), "42501");
    assert.equal(await failure(ROOT, `insert into public.admin_users (user_id) values ('${ADA}')`), "42501", "even admins go through the functions");
  });

  it("refuses every admin function to non-admins and visitors", async () => {
    for (const sql of [
      "select * from public.admin_list()",
      "select * from public.admin_search_users('example')",
      `select public.admin_grant('${BEN}')`,
      `select public.admin_revoke('${ROOT}')`,
      `select public.admin_delete_project('${P_LIVE}')`,
      `select public.admin_restore_project('${P_LIVE}')`,
      `select public.admin_set_project_state('${P_LIVE}', 'draft', 'public')`,
    ]) {
      assert.equal(await failure(BEN, sql), "42501", sql);
      assert.equal(await failure(null, sql), "42501", `${sql} (visitor)`);
    }
  });
});

describe("granting and revoking", () => {
  it("finds registered people by email or name", async () => {
    const found = await as(ROOT, () => rows("select * from public.admin_search_users('lovelace')"));
    assert.deepEqual(found.map((r) => [r.user_id, r.email, r.is_admin]), [[ADA, "ada@example.com", false]]);
    assert.equal((await as(ROOT, () => rows("select * from public.admin_search_users('a')"))).length, 0, "needs 2+ characters");
    assert.equal((await as(ROOT, () => rows("select * from public.admin_search_users('%')"))).length, 0, "wildcards are literal");
  });

  it("grants to an existing user, records who granted, and refuses duplicates and unknown users", async () => {
    await as(ROOT, () => rows(`select public.admin_grant('${ADA}')`));
    assert.equal(await isAdmin(ADA), true);
    const [row] = await rows(`select granted_by, granted_at from public.admin_users where user_id = '${ADA}'`);
    assert.equal(row.granted_by, ROOT);
    assert.ok(row.granted_at);

    assert.equal(await failure(ROOT, `select public.admin_grant('${ADA}')`), "HA002");
    assert.equal(await failure(ROOT, `select public.admin_grant('${NOBODY}')`), "HA001");
  });

  it("lists admins with their names, emails and who granted them", async () => {
    const list = await as(ADA, () => rows("select * from public.admin_list()"));
    const ada = list.find((r) => r.user_id === ADA)!;
    assert.equal(ada.email, "ada@example.com");
    assert.equal(ada.display_name, "Ada Lovelace");
    assert.equal(ada.granted_by_email, "root@example.com");
    assert.equal(ada.revoked_at, null);
  });

  it("revokes immediately, keeps the account, and records who revoked", async () => {
    await as(ROOT, () => rows(`select public.admin_grant('${BEN}')`));
    await as(ADA, () => rows(`select public.admin_revoke('${BEN}')`));
    assert.equal(await isAdmin(BEN), false, "the very next request is no longer admin");
    assert.equal(await failure(BEN, "select * from public.admin_list()"), "42501");
    assert.equal((await rows(`select count(*)::int as n from auth.users where id = '${BEN}'`))[0].n, 1, "the account stays");
    const [history] = await rows(`select revoked_by, revoked_at from public.admin_users where user_id = '${BEN}'`);
    assert.equal(history.revoked_by, ADA);
    assert.ok(history.revoked_at);
    assert.equal(await failure(ADA, `select public.admin_revoke('${BEN}')`), "HA003", "not an admin any more");

    // Granting again later adds a new row; the history stays.
    await as(ROOT, () => rows(`select public.admin_grant('${BEN}')`));
    assert.equal((await rows(`select count(*)::int as n from public.admin_users where user_id = '${BEN}'`))[0].n, 2);
    await as(ROOT, () => rows(`select public.admin_revoke('${BEN}')`));
  });

  it("never leaves the system without an admin", async () => {
    // ROOT and ADA are active. ADA may revoke herself while ROOT remains...
    await as(ADA, () => rows(`select public.admin_revoke('${ADA}')`));
    assert.equal(await isAdmin(ADA), false);
    // ...but ROOT, now the only admin, cannot revoke themselves.
    assert.equal(await failure(ROOT, `select public.admin_revoke('${ROOT}')`), "HA004");
    assert.equal(await isAdmin(ROOT), true);
  });

  it("holds even for direct SQL from a trusted connection", async () => {
    await assert.rejects(db.query(`update public.admin_users set revoked_at = now() where user_id = '${ROOT}'`), (e: { code?: string }) => e.code === "HA004");
    await assert.rejects(db.query(`delete from public.admin_users where user_id = '${ROOT}'`), (e: { code?: string }) => e.code === "HA004");
    await assert.rejects(db.query(`delete from auth.users where id = '${ROOT}'`), (e: { code?: string }) => e.code === "HA004");
    assert.equal(await isAdmin(ROOT), true);
  });
});

describe("administering projects", () => {
  it("admins see every project; others see what they saw before", async () => {
    const slugs = async (user: string | null) => (await as(user, () => rows("select slug from public.projects order by slug"))).map((r) => r.slug);
    assert.deepEqual(await slugs(ROOT), ["draft-one", "live-one"]);
    assert.deepEqual(await slugs(BEN), ["live-one"]);
    assert.deepEqual(await slugs(null), ["live-one"]);
  });

  it("an admin edits any project's content and its needs, but not moderation columns directly", async () => {
    await as(ROOT, () => rows(`update public.projects set tagline = '${text("חדש")}' where id = '${P_DRAFT}'`));
    assert.deepEqual((await rows(`select tagline from public.projects where id = '${P_DRAFT}'`))[0].tagline, { translations: { he: "חדש" } });
    await as(ROOT, () => rows(`insert into public.needs (project_id, type, description) values ('${P_DRAFT}', 'community', '${text("צורך")}')`));
    assert.equal(await failure(ROOT, `update public.projects set review_status = 'published' where id = '${P_DRAFT}'`), "42501");
  });

  it("changes publication state only through the admin function", async () => {
    await as(ROOT, () => rows(`select public.admin_set_project_state('${P_DRAFT}', 'published', 'unlisted')`));
    const [row] = await rows(`select review_status, visibility from public.projects where id = '${P_DRAFT}'`);
    assert.deepEqual(row, { review_status: "published", visibility: "unlisted" });
    assert.equal(await failure(ROOT, `select public.admin_set_project_state('${P_DRAFT}', 'nonsense', 'public')`), "23514");
    await as(ROOT, () => rows(`select public.admin_set_project_state('${P_DRAFT}', 'draft', 'public')`));
  });

  it("soft-deletes: hidden from visitors and stewards, stewards cannot edit, nothing is destroyed, and it can be restored", async () => {
    await as(ROOT, () => rows(`select public.admin_delete_project('${P_LIVE}')`));
    const [row] = await rows(`select deleted_at, deleted_by from public.projects where id = '${P_LIVE}'`);
    assert.ok(row.deleted_at);
    assert.equal(row.deleted_by, ROOT);

    assert.equal((await as(null, () => rows(`select 1 from public.projects where id = '${P_LIVE}'`))).length, 0);
    assert.equal((await as(null, () => rows(`select 1 from public.needs where project_id = '${P_LIVE}'`))).length, 0, "its needs disappear too");
    assert.equal((await as(BEN, () => rows(`select 1 from public.projects where id = '${P_LIVE}'`))).length, 0, "even for its owner");
    const updated = await as(BEN, () => rows(`update public.projects set tagline = '${text("x")}' where id = '${P_LIVE}' returning id`));
    assert.equal(updated.length, 0, "its steward can no longer edit it");
    assert.equal((await rows(`select count(*)::int as n from public.needs where project_id = '${P_LIVE}'`))[0].n, 1, "rows are kept");
    assert.equal((await rows(`select count(*)::int as n from public.project_stewards where project_id = '${P_LIVE}'`))[0].n, 1);

    assert.equal(await failure(ROOT, `select public.admin_delete_project('${P_LIVE}')`), "HA005", "already deleted");
    await as(ROOT, () => rows(`select public.admin_restore_project('${P_LIVE}')`));
    assert.equal((await as(null, () => rows(`select 1 from public.projects where id = '${P_LIVE}'`))).length, 1, "back for everyone");
    assert.equal((await as(BEN, () => rows(`update public.projects set tagline = '${text("x")}' where id = '${P_LIVE}' returning id`))).length, 1);
  });

  it("a revoked admin loses project powers at once", async () => {
    await as(ROOT, () => rows(`select public.admin_grant('${ADA}')`));
    assert.equal((await as(ADA, () => rows(`select slug from public.projects where id = '${P_DRAFT}'`))).length, 1);
    await as(ROOT, () => rows(`select public.admin_revoke('${ADA}')`));
    assert.equal((await as(ADA, () => rows(`select slug from public.projects where id = '${P_DRAFT}'`))).length, 0);
    assert.equal(await failure(ADA, `select public.admin_delete_project('${P_LIVE}')`), "42501");
  });
});
