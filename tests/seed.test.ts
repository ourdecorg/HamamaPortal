/**
 * The seed import against a real (in-process) Postgres with the real migrations:
 * every seed project fits the schema, a re-run creates no duplicates, and what is read back
 * is the project that was imported — slugs, needs and offers included.
 *
 *   npm run test:seed
 *
 * The SQL below mirrors what scripts/seed.ts sends through PostgREST (insert, and upsert on
 * `(project_id, key)`), so constraint or column mistakes surface here instead of on the first deploy.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { findConnections } from "@/lib/matching";
import { projectToRows, rowsToProject, type ProjectWithItems } from "@/lib/project-mapper";
import { projectSchema } from "@/lib/schema";
import { readSeedProjects } from "@/lib/seed-data";
import type { Project } from "@/types/project";
import { createMigratedDb } from "./helpers/pg";

let db: PGlite;
let seed: Project[];

const columns = (o: object) => Object.keys(o).map((c) => `"${c}"`).join(", ");

/** insert into <table> (cols) select cols from jsonb_populate_record(...) — types coerced like PostgREST does. */
async function insertRow(table: string, row: object, conflict?: string) {
  const cols = columns(row);
  const sql =
    `insert into public.${table} (${cols}) select ${cols} from jsonb_populate_record(null::public.${table}, $1::jsonb)` +
    (conflict ? ` on conflict ${conflict}` : "") +
    ` returning id`;
  const { rows } = await db.query<{ id: string }>(sql, [JSON.stringify(row)]);
  return rows[0]?.id;
}

/** Same steps as scripts/seed.ts in its default mode (insert what is missing, never overwrite). */
async function runSeed() {
  const existing = new Set((await db.query<{ slug: string }>("select slug from public.projects")).rows.map((r) => r.slug));
  let created = 0;
  for (const project of seed) {
    if (existing.has(project.slug)) continue;
    const rows = projectToRows(project);
    const id = await insertRow("projects", rows.project);
    for (const n of rows.needs) await insertRow("needs", { ...n, project_id: id }, "(project_id, key) do nothing");
    for (const o of rows.offers) await insertRow("offers", { ...o, project_id: id }, "(project_id, key) do nothing");
    created += 1;
  }
  return created;
}

const count = async (table: string) => Number((await db.query<{ n: string }>(`select count(*) n from public.${table}`)).rows[0].n);

before(async () => {
  seed = (await readSeedProjects()).projects;
  db = await createMigratedDb();
});
after(async () => {
  await db.close();
});

describe("seed import", () => {
  it("imports every project, with all needs and offers", async () => {
    assert.equal(await runSeed(), seed.length);
    assert.equal(await count("projects"), seed.length);
    assert.equal(await count("needs"), seed.reduce((n, p) => n + p.current_needs.length, 0));
    assert.equal(await count("offers"), seed.reduce((n, p) => n + p.offers.length, 0));
  });

  it("is idempotent: running it again creates nothing", async () => {
    const before = [await count("projects"), await count("needs"), await count("offers")];
    assert.equal(await runSeed(), 0);
    assert.deepEqual([await count("projects"), await count("needs"), await count("offers")], before);
  });

  it("does not resurrect a need a steward deleted, nor overwrite an edit", async () => {
    const victim = seed.find((p) => p.current_needs.length >= 1)!;
    await db.query("update public.projects set tagline = '{\"translations\":{\"he\":\"נערך\"}}'::jsonb where slug = $1", [victim.slug]);
    await db.query("delete from public.needs where key = $1 and project_id = (select id from public.projects where slug = $2)", [victim.current_needs[0].id, victim.slug]);
    await runSeed();
    const { rows } = await db.query<{ tagline: unknown }>("select tagline from public.projects where slug = $1", [victim.slug]);
    assert.deepEqual(rows[0].tagline, { translations: { he: "נערך" } });
    const left = await db.query("select 1 from public.needs where key = $1 and project_id = (select id from public.projects where slug = $2)", [victim.current_needs[0].id, victim.slug]);
    assert.equal(left.rows.length, 0);
  });

  it("re-applies the JSON with --update semantics: upsert by (project_id, key), no duplicates", async () => {
    const before = [await count("projects"), await count("offers")];
    for (const p of seed) {
      const rows = projectToRows(p);
      const { created_at: _created, ...patch } = rows.project;
      void _created;
      const cols = columns(patch);
      await db.query(
        `update public.projects set (${cols}) = (select ${cols} from jsonb_populate_record(null::public.projects, $1::jsonb)) where slug = $2`,
        [JSON.stringify(patch), p.slug],
      );
      const { rows: [proj] } = await db.query<{ id: string }>("select id from public.projects where slug = $1", [p.slug]);
      for (const n of rows.needs) {
        await insertRow("needs", { ...n, project_id: proj.id }, "(project_id, key) do update set description = excluded.description, position = excluded.position");
      }
      for (const o of rows.offers) {
        await insertRow("offers", { ...o, project_id: proj.id }, "(project_id, key) do update set description = excluded.description, position = excluded.position");
      }
    }
    assert.deepEqual([await count("projects"), await count("offers")], before);
    assert.equal(await count("needs"), seed.reduce((n, p) => n + p.current_needs.length, 0)); // the deleted need is back, nothing doubled
  });

  it("reads back exactly what was imported (slugs, texts, needs, offers) and yields the same connections", async () => {
    const { rows } = await db.query<Record<string, unknown>>(`
      select p.*,
             coalesce((select jsonb_agg(to_jsonb(n)) from public.needs n where n.project_id = p.id), '[]') as needs,
             coalesce((select jsonb_agg(to_jsonb(o)) from public.offers o where o.project_id = p.id), '[]') as offers
      from public.projects p`);
    const back = rows.map((r) => {
      const row = JSON.parse(JSON.stringify(r)) as ProjectWithItems;
      return projectSchema.parse(rowsToProject(row));
    });

    const bySlug = new Map(back.map((p) => [p.slug, p]));
    assert.deepEqual([...bySlug.keys()].sort(), seed.map((p) => p.slug).sort());

    for (const original of seed) {
      const got = bySlug.get(original.slug)!;
      const strip = (p: Project) => ({
        ...p,
        id: "-",
        portal: { ...p.portal, last_updated: "-" },
        current_needs: p.current_needs.map((n) => ({ ...n, id: "-" })),
        offers: p.offers.map((o) => ({ ...o, id: "-" })),
      });
      assert.deepEqual(strip(got), strip(original), original.slug);
    }
    assert.equal(findConnections(back).length, findConnections(seed).length);
  });
});
