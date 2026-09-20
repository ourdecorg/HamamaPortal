/**
 * Runs the real migrations in an in-process Postgres (PGlite) and checks the Row Level Security
 * rules the way Supabase applies them: `set role authenticated|anon` + the JWT subject.
 *
 *   npm run test:rls
 *
 * Only the Supabase-provided pieces are stubbed (see helpers/pg.ts).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/pg";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const CAROL = "00000000-0000-4000-8000-00000000000c";

const P_PUBLIC = "10000000-0000-4000-8000-000000000001";
const P_OTHER = "10000000-0000-4000-8000-000000000002";
const P_DRAFT = "10000000-0000-4000-8000-000000000003";
const P_PRIVATE = "10000000-0000-4000-8000-000000000004";
const NEED_1 = "20000000-0000-4000-8000-000000000001";
const NEED_OTHER = "20000000-0000-4000-8000-000000000002";
const OFFER_1 = "30000000-0000-4000-8000-000000000001";

const text = (he: string) => JSON.stringify({ translations: { he } });

const FIXTURES = `
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${ALICE}', 'alice@example.com', '{"full_name": "Alice"}'),
    ('${BOB}',   'bob@example.com',   '{"name": "Bob"}'),
    ('${CAROL}', 'carol@example.com', '{}');

  insert into public.projects (id, slug, name, tagline, short_description, vision, problem, desired_change,
                               domains, lifecycle_stage, review_status, visibility) values
    ('${P_PUBLIC}',  'public-one', '${text("א")}', '${text("t")}', '${text("s")}', '${text("v")}', '${text("p")}', '${text("d")}', '{community}', 'pilot', 'published', 'public'),
    ('${P_OTHER}',   'public-two', '${text("ב")}', '${text("t")}', '${text("s")}', '${text("v")}', '${text("p")}', '${text("d")}', '{community}', 'pilot', 'published', 'public'),
    ('${P_DRAFT}',   'draft-one',  '${text("ג")}', '${text("t")}', '${text("s")}', '${text("v")}', '${text("p")}', '${text("d")}', '{community}', 'idea',  'draft',     'public'),
    ('${P_PRIVATE}', 'private-one','${text("ד")}', '${text("t")}', '${text("s")}', '${text("v")}', '${text("p")}', '${text("d")}', '{community}', 'idea',  'published', 'private');

  insert into public.needs (id, project_id, key, type, description) values
    ('${NEED_1}',     '${P_PUBLIC}',  'need-1', 'community', '${text("צורך")}'),
    ('${NEED_OTHER}', '${P_OTHER}',   'need-1', 'community', '${text("צורך אחר")}'),
    ('20000000-0000-4000-8000-000000000009', '${P_DRAFT}', 'need-1', 'community', '${text("צורך בטיוטה")}');

  insert into public.offers (id, project_id, key, type, description) values
    ('${OFFER_1}', '${P_OTHER}', 'offer-1', 'knowledge', '${text("הצעה")}');

  insert into public.wishes (user_id, text, visibility) values
    ('${ALICE}', 'alice private wish', 'private'),
    ('${ALICE}', 'alice public wish',  'public');
`;

let db: PGlite;

/** Run `fn` with the Postgres role and JWT subject Supabase would use for this caller. */
async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ""]);
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

const rows = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows;

before(async () => {
  db = await createMigratedDb();
  await db.exec(FIXTURES);
});

after(async () => {
  await db.close();
});

describe("profiles", () => {
  it("are created automatically for new auth users", async () => {
    const all = await rows("select id, display_name from public.profiles order by display_name nulls last");
    assert.equal(all.length, 3);
    assert.deepEqual(all.map((r) => r.display_name), ["Alice", "Bob", null]);
  });

  it("can only be read and edited by their owner", async () => {
    const own = await as(ALICE, () => rows("select id from public.profiles"));
    assert.deepEqual(own.map((r) => r.id), [ALICE]);

    const anon = await as(null, () => rows("select id from public.profiles").catch(() => "denied"));
    assert.equal(anon, "denied");

    const hijack = await as(BOB, () => rows("update public.profiles set display_name = 'x' where id = $1 returning id", [ALICE]));
    assert.equal(hijack.length, 0);
  });
});

describe("projects", () => {
  it("shows anonymous visitors only published, non-private projects", async () => {
    const seen = await as(null, () => rows("select slug from public.projects order by slug"));
    assert.deepEqual(seen.map((r) => r.slug), ["public-one", "public-two"]);
  });

  it("hides the needs of projects the caller cannot see", async () => {
    const seen = await as(null, () => rows("select project_id from public.needs order by project_id"));
    assert.deepEqual(seen.map((r) => r.project_id), [P_PUBLIC, P_OTHER]);
  });

  it("does not let a non-steward, or a pending steward, edit", async () => {
    const outsider = await as(BOB, () => rows("update public.projects set tagline = $1 where id = $2 returning id", [text("hack"), P_PUBLIC]));
    assert.equal(outsider.length, 0);

    const anon = await as(null, () => rows("update public.projects set tagline = 'x' where id = $1 returning id", [P_PUBLIC]).catch(() => "denied"));
    assert.equal(anon, "denied");
  });
});

describe("stewardship", () => {
  it("lets a user request stewardship — as pending steward, for themselves, of a visible project", async () => {
    await as(BOB, () =>
      db.query("insert into public.project_stewards (project_id, user_id) values ($1, $2)", [P_PUBLIC, BOB]),
    );
    const mine = await as(BOB, () => rows("select status, role from public.project_stewards"));
    assert.deepEqual(mine, [{ status: "pending", role: "steward" }]);
  });

  it("refuses self-approval, self-made owners and requests in someone else's name", async () => {
    const attempt = (sql: string, params: unknown[]) => as(CAROL, () => db.query(sql, params));
    await assert.rejects(attempt("insert into public.project_stewards (project_id, user_id, status) values ($1, $2, 'approved')", [P_PUBLIC, CAROL]));
    await assert.rejects(attempt("insert into public.project_stewards (project_id, user_id, role) values ($1, $2, 'owner')", [P_PUBLIC, CAROL]));
    await assert.rejects(attempt("insert into public.project_stewards (project_id, user_id) values ($1, $2)", [P_PUBLIC, ALICE]));
    // a project she cannot see cannot be claimed
    await assert.rejects(attempt("insert into public.project_stewards (project_id, user_id) values ($1, $2)", [P_PRIVATE, CAROL]));
  });

  it("has no UPDATE path for users, so a pending request cannot be approved from the app", async () => {
    await assert.rejects(as(BOB, () => db.query("update public.project_stewards set status = 'approved' where user_id = $1", [BOB])));
  });

  it("keeps requests private to their owner", async () => {
    const carol = await as(CAROL, () => rows("select user_id from public.project_stewards"));
    assert.equal(carol.length, 0);
  });

  it("lets a pending request be withdrawn", async () => {
    await as(CAROL, () => db.query("insert into public.project_stewards (project_id, user_id) values ($1, $2)", [P_OTHER, CAROL]));
    const gone = await as(CAROL, () => rows("delete from public.project_stewards where user_id = $1 returning user_id", [CAROL]));
    assert.equal(gone.length, 1);
  });
});

describe("approved stewards", () => {
  before(async () => {
    // What `npm run steward:approve` does (service role / SQL editor).
    await db.query("update public.project_stewards set status = 'approved' where project_id = $1 and user_id = $2", [P_PUBLIC, BOB]);
  });

  it("can edit content columns and the activity status", async () => {
    const done = await as(BOB, () =>
      rows("update public.projects set tagline = $1, activity_status = 'paused' where id = $2 returning id", [text("חדש"), P_PUBLIC]),
    );
    assert.equal(done.length, 1);
    const [row] = await rows("select tagline, activity_status, updated_at > created_at as touched from public.projects where id = $1", [P_PUBLIC]);
    assert.deepEqual(row.tagline, { translations: { he: "חדש" } });
    assert.equal(row.activity_status, "paused");
    assert.equal(row.touched, true, "updated_at is maintained by the trigger");
  });

  it("cannot touch identity or moderation columns", async () => {
    for (const set of ["slug = 'stolen'", "review_status = 'draft'", "visibility = 'private'", "is_demo = true", `created_by = '${BOB}'`]) {
      await assert.rejects(as(BOB, () => db.query(`update public.projects set ${set} where id = $1`, [P_PUBLIC])), /permission denied/, set);
    }
  });

  it("can edit, add and remove needs and offers of their own project", async () => {
    const upd = await as(BOB, () =>
      rows("update public.needs set description = $1, status = 'in_conversation' where id = $2 returning id", [text("עודכן"), NEED_1]),
    );
    assert.equal(upd.length, 1);
    const [n] = await rows("select description, status from public.needs where id = $1", [NEED_1]);
    assert.deepEqual(n.description, { translations: { he: "עודכן" } });

    await as(BOB, () =>
      db.query("insert into public.needs (project_id, type, description) values ($1, 'tool', $2)", [P_PUBLIC, text("חדש")]),
    );
    await as(BOB, () =>
      db.query("insert into public.offers (project_id, type, description) values ($1, 'tool', $2)", [P_PUBLIC, text("חדש")]),
    );
    const removed = await as(BOB, () => rows("delete from public.needs where project_id = $1 and type = 'tool' returning id", [P_PUBLIC]));
    assert.equal(removed.length, 1);
  });

  it("cannot edit other projects or move a need into one", async () => {
    const other = await as(BOB, () => rows("update public.needs set type = 'tool' where id = $1 returning id", [NEED_OTHER]));
    assert.equal(other.length, 0);
    await assert.rejects(as(BOB, () => db.query("insert into public.needs (project_id, type, description) values ($1, 'tool', $2)", [P_OTHER, text("x")])));
    await assert.rejects(as(BOB, () => db.query("update public.needs set project_id = $1 where id = $2", [P_OTHER, NEED_1])));
  });

  it("can see a draft they steward; others cannot", async () => {
    await db.query("insert into public.project_stewards (project_id, user_id, role, status) values ($1, $2, 'owner', 'approved')", [P_DRAFT, ALICE]);
    const alice = await as(ALICE, () => rows("select slug from public.projects where id = $1", [P_DRAFT]));
    assert.equal(alice.length, 1);
    const bob = await as(BOB, () => rows("select slug from public.projects where id = $1", [P_DRAFT]));
    assert.equal(bob.length, 0);
  });
});

describe("wishes", () => {
  it("are readable by the owner; only public ones by everybody else", async () => {
    assert.equal((await as(ALICE, () => rows("select id from public.wishes"))).length, 2);
    const bob = await as(BOB, () => rows("select text from public.wishes"));
    assert.deepEqual(bob.map((r) => r.text), ["alice public wish"]);
    const anon = await as(null, () => rows("select text from public.wishes"));
    assert.deepEqual(anon.map((r) => r.text), ["alice public wish"]);
  });

  it("can be created only for yourself, with optional fields left empty", async () => {
    await as(BOB, () => db.query("insert into public.wishes (user_id, text) values ($1, 'bob wish')", [BOB]));
    const [w] = await rows("select visibility, status, domains, desired_outcome, interpretation from public.wishes where text = 'bob wish'");
    assert.deepEqual(w, { visibility: "private", status: "open", domains: [], desired_outcome: null, interpretation: {} });
    await assert.rejects(as(BOB, () => db.query("insert into public.wishes (user_id, text) values ($1, 'forged')", [ALICE])));
    await assert.rejects(as(null, () => db.query("insert into public.wishes (user_id, text) values ($1, 'anon')", [ALICE])));
  });

  it("can only be edited or deleted by the owner", async () => {
    const stolen = await as(BOB, () => rows("update public.wishes set status = 'archived' where user_id = $1 returning id", [ALICE]));
    assert.equal(stolen.length, 0);
    const deleted = await as(BOB, () => rows("delete from public.wishes where user_id = $1 returning id", [ALICE]));
    assert.equal(deleted.length, 0);
    const own = await as(ALICE, () => rows("update public.wishes set status = 'exploring' where user_id = $1 returning id", [ALICE]));
    assert.equal(own.length, 2);
    await assert.rejects(as(ALICE, () => db.query("update public.wishes set status = 'weird' where user_id = $1", [ALICE])));
  });
});

describe("opportunities", () => {
  const insert = (user: string, over: Record<string, unknown> = {}) => {
    const v = {
      requested_by: user,
      created_by: user,
      status: "interested",
      source: P_PUBLIC,
      target: P_OTHER,
      need: NEED_1,
      offer: OFFER_1,
      ...over,
    };
    return as(user, () =>
      rows(
        `insert into public.opportunities (source_entity_type, source_entity_id, target_entity_type, target_entity_id,
                                           need_id, offer_id, rationale, unknowns, confidence, status, requested_by, created_by)
         values ('project', $1, 'project', $2, $3, $4, 'because', '["geography"]', 0.7, $5, $6, $7) returning id, status`,
        [v.source, v.target, v.need, v.offer, v.status, v.requested_by, v.created_by],
      ),
    );
  };

  let oppId: string;

  it("can be created by a signed-in user for themselves, as 'interested'", async () => {
    const [opp] = await insert(CAROL);
    oppId = opp.id as string;
    assert.equal(opp.status, "interested");
  });

  it("is idempotent per person and connection", async () => {
    await assert.rejects(insert(CAROL), /duplicate key|unique/i);
    const [other] = await insert(ALICE); // a different person may also be interested
    assert.ok(other.id);
  });

  it("cannot be forged: someone else's name, other statuses, mismatched need/offer, anonymous", async () => {
    await assert.rejects(insert(BOB, { requested_by: CAROL }));
    await assert.rejects(insert(BOB, { created_by: CAROL }));
    await assert.rejects(insert(BOB, { status: "in_progress" }));
    await assert.rejects(insert(BOB, { need: NEED_OTHER })); // need belongs to the target, not the source
    await assert.rejects(insert(BOB, { source: P_PRIVATE, need: null }));
    await assert.rejects(as(null, () => db.query("insert into public.opportunities (source_entity_type, source_entity_id, target_entity_type, target_entity_id) values ('project', $1, 'project', $2)", [P_PUBLIC, P_OTHER])));
  });

  it("is visible to the requester and to stewards of the projects involved — nobody else", async () => {
    assert.equal((await as(CAROL, () => rows("select id from public.opportunities"))).length, 1);
    assert.equal((await as(BOB, () => rows("select id from public.opportunities"))).length, 2); // Bob stewards P_PUBLIC (the source)
    await db.query("delete from public.project_stewards where user_id = $1", [BOB]);
    assert.equal((await as(BOB, () => rows("select id from public.opportunities"))).length, 0);
    const anon = await as(null, () => rows("select id from public.opportunities").catch(() => "denied"));
    assert.equal(anon, "denied");
  });

  it("lets the requester advance only their own row, and only the status", async () => {
    const own = await as(CAROL, () => rows("update public.opportunities set status = 'intro_requested' where id = $1 returning status", [oppId]));
    assert.deepEqual(own, [{ status: "intro_requested" }]);

    const others = await as(BOB, () => rows("update public.opportunities set status = 'closed' where id = $1 returning id", [oppId]));
    assert.equal(others.length, 0);

    await assert.rejects(as(CAROL, () => db.query("update public.opportunities set status = 'in_progress' where id = $1", [oppId])));
    await assert.rejects(as(CAROL, () => db.query("update public.opportunities set requested_by = $1 where id = $2", [BOB, oppId])));
    await assert.rejects(as(CAROL, () => db.query("update public.opportunities set rationale = 'x' where id = $1", [oppId])));
  });
});
