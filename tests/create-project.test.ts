/**
 * Creating a project from the wizard, straight into Supabase — against real Postgres (PGlite) with the real
 * migrations, exactly as Supabase applies them (role + JWT subject, Row Level Security, column grants).
 *
 *   npm run test:create
 *
 * What is NOT covered here: the browser redirect to Google and back, and the server action's cookies. The
 * pure pipeline the action runs (draft → validation → rows → database function) is, end to end.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { findConnections } from "@/lib/matching";
import { projectToRows, rowsToProject, type CreateProjectArgs, type ProjectWithItems } from "@/lib/project-mapper";
import {
  PROJECT_DRAFT_KEY,
  PROJECT_DRAFT_TTL_MS,
  forgetProjectDraft,
  rememberProjectDraft,
  takeProjectDraft,
} from "@/lib/project-draft";
import { projectSchema } from "@/lib/schema";
import { readSeedProjects } from "@/lib/seed-data";
import { emptyDraft, newItem, prepareNewProject, type Draft } from "@/lib/wizard";
import type { Project } from "@/types/project";
import { asUser, createMigratedDb } from "./helpers/pg";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;
let seed: Project[];

const rows = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows;
const count = async (table: string) => Number((await rows(`select count(*)::int as n from public.${table}`))[0].n);
const counts = async () => [await count("projects"), await count("project_stewards"), await count("needs"), await count("offers")];

/** A complete, valid wizard draft. */
function draftOf(over: Partial<Draft> = {}): Draft {
  return {
    ...emptyDraft(),
    name: "Neighbors Learn",
    slug: "neighbors-learn",
    tagline: "כל שכונה מלאה במורים",
    short_description: "מפגשי לימוד קטנים בין שכנים.",
    vision: "שכונות שבהן כולם לומדים מכולם.",
    problem: "ידע נשאר סגור בתוך הבתים.",
    desired_change: "מפגש אחד בשבוע בכל רחוב.",
    domains: ["education"],
    needs: [{ ...newItem("community"), title: "קבוצה לפיילוט", description: "שלושים שכנים שמוכנים לנסות", keywords: "neighbors, pilot" }],
    offers: [{ ...newItem("knowledge"), title: "שיטת הלימוד", description: "מתודולוגיה של מפגש שכנים", keywords: "teaching, method" }],
    ...over,
  };
}

function argsOf(draft: Draft): CreateProjectArgs {
  const prepared = prepareNewProject(draft);
  assert.ok(prepared.ok, prepared.ok ? "" : prepared.error);
  return prepared.args;
}

/** What the server action sends to `supabase.rpc("create_project", …)`, as the given user. */
function create(user: string | null, args: CreateProjectArgs | { p_project: unknown; p_needs: unknown; p_offers: unknown }) {
  return asUser(db, user, async () => {
    const { rows: out } = await db.query<{ r: { id: string; slug: string } }>(
      "select public.create_project($1::jsonb, $2::jsonb, $3::jsonb) as r",
      [JSON.stringify(args.p_project), JSON.stringify(args.p_needs), JSON.stringify(args.p_offers)],
    );
    return out[0].r;
  });
}

/** The public catalogue as an anonymous visitor reads it (RLS applies), mapped like lib/projects.ts does. */
async function readCatalogue(): Promise<Project[]> {
  const found = await asUser(db, null, () =>
    rows(`
      select p.*,
             coalesce((select jsonb_agg(to_jsonb(n)) from public.needs n where n.project_id = p.id), '[]') as needs,
             coalesce((select jsonb_agg(to_jsonb(o)) from public.offers o where o.project_id = p.id), '[]') as offers
      from public.projects p
      where p.review_status = 'published' and p.visibility <> 'private'`),
  );
  return found.map((r) => projectSchema.parse(rowsToProject(JSON.parse(JSON.stringify(r)) as ProjectWithItems)));
}

const insertJson = async (table: string, row: object) => {
  const cols = Object.keys(row).map((c) => `"${c}"`).join(", ");
  const { rows: out } = await db.query<{ id: string }>(
    `insert into public.${table} (${cols}) select ${cols} from jsonb_populate_record(null::public.${table}, $1::jsonb) returning id`,
    [JSON.stringify(row)],
  );
  return out[0].id;
};

before(async () => {
  seed = (await readSeedProjects()).projects;
  db = await createMigratedDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ALICE}', 'alice@example.com', '{"full_name": "Alice"}'),
      ('${BOB}',   'bob@example.com',   '{"name": "Bob"}');`);
  // The bootstrap data an admin imported with `npm run db:seed`.
  for (const p of seed) {
    const r = projectToRows(p);
    const id = await insertJson("projects", r.project);
    for (const n of r.needs) await insertJson("needs", { ...n, project_id: id });
    for (const o of r.offers) await insertJson("offers", { ...o, project_id: id });
  }
});

after(async () => {
  await db.close();
});

// ------------------------------------------------------------- TEST 1 / 2 ---

describe("a signed-in person creates a project", () => {
  let created: { id: string; slug: string };

  it("is refused for a visitor who is not signed in (nothing is written)", async () => {
    const before = await counts();
    await assert.rejects(create(null, argsOf(draftOf())), /permission denied/);
    assert.deepEqual(await counts(), before);
  });

  it("creates the project, the approved OWNER stewardship, the Need and the Offer together", async () => {
    created = await create(ALICE, argsOf(draftOf()));
    assert.equal(created.slug, "neighbors-learn");

    const [project] = await rows("select * from public.projects where id = $1", [created.id]);
    assert.equal(project.created_by, ALICE);
    assert.equal(project.review_status, "published");
    assert.equal(project.visibility, "public");
    assert.equal(project.is_demo, false);
    assert.equal(project.lifecycle_stage, "idea");

    const stewards = await rows("select user_id, role, status from public.project_stewards where project_id = $1", [created.id]);
    assert.deepEqual(stewards, [{ user_id: ALICE, role: "owner", status: "approved" }]);

    const needs = await rows("select type, status, position, key, keywords from public.needs where project_id = $1", [created.id]);
    assert.deepEqual(needs, [{ type: "community", status: "open", position: 0, key: null, keywords: ["neighbors", "pilot"] }]);
    const offers = await rows("select type, status, position, key, keywords from public.offers where project_id = $1", [created.id]);
    assert.deepEqual(offers, [{ type: "knowledge", status: "active", position: 0, key: null, keywords: ["teaching", "method"] }]);
  });

  it("shows up in the creator's My Space (the stewardship query the page runs, under RLS)", async () => {
    const mine = await asUser(db, ALICE, () =>
      rows(`select s.role, s.status, p.slug from public.project_stewards s join public.projects p on p.id = s.project_id where s.user_id = $1`, [ALICE]),
    );
    assert.deepEqual(mine, [{ role: "owner", status: "approved", slug: "neighbors-learn" }]);
  });

  it("is public at once: an anonymous visitor reads the project page data, with both Needs and Offers", async () => {
    const project = (await readCatalogue()).find((p) => p.slug === "neighbors-learn")!;
    assert.ok(project, "the new project is part of the catalogue");
    assert.equal(project.current_needs.length, 1);
    assert.equal(project.offers.length, 1);
    assert.equal(project.portal.review_status, "published");
    assert.equal(project.portal.is_demo, false);
    assert.equal(project.people.stewards.length, 0);
  });

  it("feeds matching immediately: a new Need meets an existing Offer, a new Offer meets an existing Need", async () => {
    const provider = seed.find((p) => p.offers.length > 0)!;
    const offer = provider.offers[0];
    const asker = seed.find((p) => p.id !== provider.id && p.current_needs.some((n) => n.status === "open"))!;
    const need = asker.current_needs.find((n) => n.status === "open")!;

    const draft = draftOf({
      name: "Matching probe",
      slug: "matching-probe",
      domains: provider.domains,
      collab: provider.collaboration_preferences.types,
      // the new project needs what `provider` offers, and offers what `asker` needs
      needs: [{ ...newItem(offer.type), title: "", description: offer.description.translations.he ?? "", keywords: offer.keywords.join(", ") }],
      offers: [{ ...newItem(need.type), title: "", description: need.description.translations.he ?? "", keywords: need.keywords.join(", ") }],
    });
    const probe = await create(BOB, argsOf(draft));

    const all = await readCatalogue();
    const before = findConnections(all.filter((p) => p.slug !== "matching-probe"));
    const after = findConnections(all);
    const mine = after.filter((c) => c.project_a.id === probe.id || c.project_b.id === probe.id);

    assert.ok(mine.length > 0, "the new project takes part in connections without any import step");
    assert.ok(after.length > before.length, "the ecosystem gained connections");
    assert.ok(mine.some((c) => [c.project_a.slug, c.project_b.slug].includes(provider.slug)), "…with the project whose offer it needs");
    const newProject = all.find((p) => p.id === probe.id)!;
    assert.ok(
      mine.some((c) => (c.project_a.id === probe.id && newProject.current_needs.some((n) => n.id === c.need.id)) || (c.project_b.id === probe.id && newProject.offers.some((o) => o.id === c.offer.id))),
      "the connection is built from the new Need / Offer themselves",
    );
  });
});

// ------------------------------------------------------------------ TEST 3 ---

describe("who may edit a new project", () => {
  let id: string;
  before(async () => {
    id = (await rows("select id from public.projects where slug = 'neighbors-learn'"))[0].id as string;
  });

  it("lets the creator edit content, needs and offers — but not identity or publication state", async () => {
    const tagline = JSON.stringify({ translations: { he: "עודכן" } });
    const done = await asUser(db, ALICE, () => rows("update public.projects set tagline = $1 where id = $2 returning id", [tagline, id]));
    assert.equal(done.length, 1);
    await asUser(db, ALICE, () => db.query("insert into public.needs (project_id, type, description) values ($1, 'tool', $2)", [id, JSON.stringify({ translations: { he: "עוד צורך" } })]));

    for (const set of ["slug = 'renamed'", "review_status = 'draft'", "visibility = 'private'", "is_demo = true"]) {
      await assert.rejects(asUser(db, ALICE, () => db.query(`update public.projects set ${set} where id = $1`, [id])), /permission denied/, set);
    }
  });

  it("does not let another user edit it (content, needs, offers)", async () => {
    const hack = JSON.stringify({ translations: { he: "פריצה" } });
    assert.equal((await asUser(db, BOB, () => rows("update public.projects set tagline = $1 where id = $2 returning id", [hack, id]))).length, 0);
    assert.equal((await asUser(db, BOB, () => rows("update public.needs set description = $1 where project_id = $2 returning id", [hack, id]))).length, 0);
    assert.equal((await asUser(db, BOB, () => rows("delete from public.offers where project_id = $1 returning id", [id]))).length, 0);
    await assert.rejects(asUser(db, BOB, () => db.query("insert into public.needs (project_id, type, description) values ($1, 'tool', $2)", [id, hack])));
  });

  it("lets another user request stewardship — pending only, exactly as for any existing project", async () => {
    await asUser(db, BOB, () => db.query("insert into public.project_stewards (project_id, user_id) values ($1, $2)", [id, BOB]));
    const bob = await asUser(db, BOB, () => rows("select role, status from public.project_stewards where project_id = $1", [id]));
    assert.deepEqual(bob, [{ role: "steward", status: "pending" }]);

    // …and still cannot edit while pending, nor approve themselves, nor become an owner
    assert.equal((await asUser(db, BOB, () => rows("update public.projects set tagline = '{}' where id = $1 returning id", [id]))).length, 0);
    await assert.rejects(asUser(db, BOB, () => db.query("update public.project_stewards set status = 'approved' where user_id = $1", [BOB])));
    await assert.rejects(asUser(db, BOB, () => db.query("insert into public.project_stewards (project_id, user_id, role, status) values ($1, $2, 'owner', 'approved')", [id, BOB])));
  });

  it("gives nobody a way to create a project, or an owner, except the function", async () => {
    await assert.rejects(
      asUser(db, ALICE, () =>
        db.query(
          `insert into public.projects (slug, name, tagline, short_description, vision, problem, desired_change, lifecycle_stage, created_by)
           values ('sneaky', '{}', '{}', '{}', '{}', '{}', '{}', 'idea', $1)`,
          [ALICE],
        ),
      ),
      /permission denied/,
    );
    assert.equal((await rows("select 1 from public.projects where slug = 'sneaky'")).length, 0);
  });

  it("cannot create a project owned by somebody else: the owner is always the caller, whatever the payload says", async () => {
    const args = argsOf(draftOf({ name: "Mine", slug: "mine" }));
    const forged = {
      ...args,
      p_project: { ...args.p_project, created_by: ALICE, review_status: "draft", visibility: "private", is_demo: true, id: "10000000-0000-4000-8000-0000000000ff", user_id: ALICE },
    };
    const made = await create(BOB, forged);
    const [row] = await rows("select id, created_by, review_status, visibility, is_demo from public.projects where slug = $1", [made.slug]);
    assert.equal(row.created_by, BOB);
    assert.equal(row.review_status, "published");
    assert.equal(row.visibility, "public");
    assert.equal(row.is_demo, false);
    assert.notEqual(row.id, "10000000-0000-4000-8000-0000000000ff");
    assert.deepEqual(await rows("select user_id, role, status from public.project_stewards where project_id = $1", [made.id]), [{ user_id: BOB, role: "owner", status: "approved" }]);
  });
});

// ------------------------------------------------------------------ TEST 4 ---

describe("slugs", () => {
  it("never overwrite another project: the same name gets the next free slug", async () => {
    const [before] = await rows("select id, name, tagline, created_by from public.projects where slug = 'neighbors-learn'");

    const second = await create(BOB, argsOf(draftOf({ tagline: "אחר לגמרי" })));
    const third = await create(ALICE, argsOf(draftOf()));
    assert.equal(second.slug, "neighbors-learn-2");
    assert.equal(third.slug, "neighbors-learn-3");
    assert.notEqual(second.id, before.id);

    const [after] = await rows("select id, name, tagline, created_by from public.projects where slug = 'neighbors-learn'");
    assert.deepEqual(after.id, before.id);
    assert.deepEqual(after.name, before.name);
    assert.equal(after.created_by, before.created_by);
    assert.equal(after.created_by, ALICE);
  });

  it("do not collide with seeded projects either (the seed's slugs stay theirs)", async () => {
    const taken = seed[0];
    const made = await create(ALICE, argsOf(draftOf({ name: taken.slug, slug: taken.slug })));
    assert.equal(made.slug, `${taken.slug}-2`);
    const [orig] = await rows("select created_by, is_demo from public.projects where slug = $1", [taken.slug]);
    assert.equal(orig.created_by, null);
    assert.equal(orig.is_demo, taken.portal.is_demo);
  });

  it("are stable while editing: an edit never renames, so existing URLs keep working", async () => {
    await assert.rejects(asUser(db, ALICE, () => db.query("update public.projects set slug = 'other' where slug = 'neighbors-learn'")), /permission denied/);
    assert.equal((await rows("select 1 from public.projects where slug = 'neighbors-learn'")).length, 1);
  });

  it("keep the reserved 'new' route free, and reject anything that is not a slug", async () => {
    // The app refuses "new" before it gets here (see the wizard tests); the database guards it on its own.
    const args = argsOf(draftOf());
    const made = await create(ALICE, { ...args, p_project: { ...args.p_project, slug: "new" } });
    assert.equal(made.slug, "new-2");
    for (const bad of ["Not A Slug", "", "-x", "a--b", "x".repeat(81)]) {
      await assert.rejects(create(ALICE, { ...args, p_project: { ...args.p_project, slug: bad } }), /invalid slug/, bad);
    }
  });

  it("fall back to a neutral slug for a Hebrew name — and still stay unique", async () => {
    const draft = draftOf({ name: "שכנים לומדים", slug: "" });
    const a = await create(ALICE, argsOf(draft));
    const b = await create(BOB, argsOf(draft));
    // "my-project" may already belong to a seed file; either way the two new projects are distinct
    assert.match(a.slug, /^my-project(-\d+)?$/);
    assert.match(b.slug, /^my-project(-\d+)?$/);
    assert.notEqual(a.slug, b.slug);
  });
});

// ------------------------------------------------------------------ TEST 5 ---

describe("a failure midway leaves nothing behind", () => {
  it("rolls back everything when a Need is invalid", async () => {
    const args = argsOf(draftOf({ name: "Doomed A", slug: "doomed-a" }));
    const before = await counts();
    await assert.rejects(create(ALICE, { ...args, p_needs: [{ ...args.p_needs[0], type: "Not A Type" }] }), /violates check constraint/);
    assert.deepEqual(await counts(), before);
    assert.equal((await rows("select 1 from public.projects where slug = 'doomed-a'")).length, 0);
  });

  it("rolls back the project, the steward and the Needs when the LAST write (an Offer) fails", async () => {
    const args = argsOf(draftOf({ name: "Doomed B", slug: "doomed-b" }));
    const before = await counts();
    const brokenOffers = [args.p_offers[0], { ...args.p_offers[0], description: null }];
    await assert.rejects(create(ALICE, { ...args, p_offers: brokenOffers }), /not-null constraint/);
    assert.deepEqual(await counts(), before);
    assert.equal((await rows("select 1 from public.projects where slug = 'doomed-b'")).length, 0);
    assert.equal((await rows("select 1 from public.project_stewards s join public.projects p on p.id = s.project_id where p.slug = 'doomed-b'")).length, 0);
  });

  it("rejects malformed payloads before writing anything", async () => {
    const args = argsOf(draftOf({ name: "Doomed C", slug: "doomed-c" }));
    const before = await counts();
    await assert.rejects(create(ALICE, { ...args, p_project: { ...args.p_project, name: { translations: {} } } }), /missing text: name/);
    await assert.rejects(create(ALICE, { ...args, p_project: { ...args.p_project, domains: [] } }), /at least one domain/);
    await assert.rejects(create(ALICE, { ...args, p_needs: { not: "an array" } }), /invalid project payload/);
    await assert.rejects(create(ALICE, { ...args, p_needs: Array.from({ length: 21 }, () => args.p_needs[0]) }), /too large/);
    assert.deepEqual(await counts(), before);
  });

  it("a failed attempt does not burn the slug: the next success gets it", async () => {
    const good = await create(ALICE, argsOf(draftOf({ name: "Doomed A", slug: "doomed-a" })));
    assert.equal(good.slug, "doomed-a");
  });
});

// ---------------------------------------------- the pure pipeline, no DB ---

describe("prepareNewProject (what the server action checks first)", () => {
  it("turns a wizard draft into content-only arguments — no owner, visibility, review state or ids", () => {
    const args = argsOf(draftOf());
    assert.deepEqual(Object.keys(args.p_project).sort(), [
      "activity_status", "collaboration_types", "desired_change", "domains", "lifecycle_stage", "links", "location",
      "name", "problem", "short_description", "slug", "tagline", "team", "vision",
    ]);
    assert.equal(args.p_needs.length, 1);
    assert.equal(args.p_offers.length, 1);
    assert.equal(args.p_needs[0].key, null);
  });

  it("ignores fields the browser should not control", () => {
    const smuggled = { ...draftOf(), visibility: "private", review_status: "draft", created_by: ALICE, owner: BOB };
    const args = argsOf(smuggled as Draft);
    assert.ok(!("created_by" in args.p_project) && !("visibility" in args.p_project) && !("review_status" in args.p_project));
  });

  it("rejects incomplete or malformed drafts with a message", () => {
    for (const bad of [
      draftOf({ name: "" }),
      draftOf({ tagline: "" }),
      draftOf({ vision: "" }),
      draftOf({ domains: [] }),
      draftOf({ slug: "Not A Slug!" }),
      { ...draftOf(), stage: "nonsense" },
      { ...draftOf(), name: "x".repeat(500) },
      null,
      "text",
    ]) {
      const res = prepareNewProject(bad);
      assert.equal(res.ok, false, JSON.stringify(bad)?.slice(0, 60));
    }
  });

  it("explains, in Hebrew, that /projects/new is reserved", () => {
    const res = prepareNewProject(draftOf({ name: "New", slug: "new" }));
    assert.equal(res.ok, false);
    assert.match(res.ok ? "" : res.error, /שמור למערכת/);
  });

  it("drops empty needs and offers, and allows a project with none", () => {
    const args = argsOf(draftOf({ needs: [newItem("community")], offers: [] }));
    assert.equal(args.p_needs.length, 0);
    assert.equal(args.p_offers.length, 0);
  });
});

// -------------------------------------------------------- draft survives sign-in ---

describe("the draft that waits while a visitor signs in", () => {
  function fakeStorage() {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  }

  it("comes back exactly as typed, and the same draft creates the project after sign-in", async () => {
    const storage = fakeStorage();
    const typed = draftOf({ name: "נכתב לפני ההתחברות", slug: "written-before-login" });
    rememberProjectDraft(typed, storage); // the visitor pressed publish; the server said auth_required
    // …Google round-trip: a different page load, so only what is in storage survives…
    const restored = takeProjectDraft(storage);
    assert.deepEqual(restored, typed);

    const made = await create(ALICE, argsOf(restored!));
    assert.equal(made.slug, "written-before-login");
    forgetProjectDraft(storage);
    assert.equal(takeProjectDraft(storage), null, "a created project's draft is not offered again");
  });

  it("expires, so a stale draft never creates a project days later", () => {
    const storage = fakeStorage();
    rememberProjectDraft(draftOf(), storage);
    assert.equal(takeProjectDraft(storage, Date.now() + PROJECT_DRAFT_TTL_MS + 1000), null);
    assert.equal(storage.data.has(PROJECT_DRAFT_KEY), false);
  });

  it("does not trust what it reads back: a tampered or broken draft is discarded", () => {
    const storage = fakeStorage();
    storage.setItem(PROJECT_DRAFT_KEY, JSON.stringify({ draft: { ...draftOf(), stage: "nonsense" }, at: Date.now() }));
    assert.equal(takeProjectDraft(storage), null);
    storage.setItem(PROJECT_DRAFT_KEY, "{not json");
    assert.equal(takeProjectDraft(storage), null);
    assert.equal(takeProjectDraft(fakeStorage()), null);
  });

  it("survives storage that throws (private mode)", () => {
    const broken = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
      removeItem: () => { throw new Error("denied"); },
    };
    assert.doesNotThrow(() => rememberProjectDraft(draftOf(), broken));
    assert.equal(takeProjectDraft(broken), null);
    assert.doesNotThrow(() => forgetProjectDraft(broken));
  });
});
