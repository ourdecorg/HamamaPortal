/**
 * The seed JSON must survive JSON → Supabase rows → app model without losing anything, and a
 * project edited through the wizard must keep the translations the wizard does not show.
 *
 *   npm run test:mapper
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findConnections } from "@/lib/matching";
import { projectToRows, rowsToProject, type ProjectWithItems } from "@/lib/project-mapper";
import { projectSchema } from "@/lib/schema";
import { readSeedProjects } from "@/lib/seed-data";
import { applyDraft, draftFromProject, draftSchema } from "@/lib/wizard";
import type { Project } from "@/types/project";

/** Pretend the rows went through Postgres: add the ids the database would generate. */
function throughDatabase(p: Project): { row: ProjectWithItems; keyById: Map<string, string> } {
  const rows = projectToRows(p);
  const keyById = new Map<string, string>();
  const withIds = <T extends { key: string | null }>(items: T[], prefix: string) =>
    items.map((it, i) => {
      const id = `${prefix}-${p.slug}-${i}`;
      keyById.set(id, it.key ?? id);
      return { ...it, id, project_id: `project-${p.slug}` };
    });
  const row = {
    ...rows.project,
    id: `project-${p.slug}`,
    created_by: null,
    needs: withIds(rows.needs, "need"),
    offers: withIds(rows.offers, "offer"),
  } as ProjectWithItems;
  return { row, keyById };
}

/** Compare projects ignoring ids (the database assigns uuids; the JSON key is kept in `key`). */
function comparable(p: Project, keyById = new Map<string, string>()) {
  return {
    ...p,
    id: "-",
    current_needs: p.current_needs.map((n) => ({ ...n, id: keyById.get(n.id) ?? n.id })),
    offers: p.offers.map((o) => ({ ...o, id: keyById.get(o.id) ?? o.id })),
  };
}

describe("seed JSON → rows → project", async () => {
  const { projects, issues } = await readSeedProjects();

  it("loads every seed file", () => {
    assert.deepEqual(issues, []);
    assert.ok(projects.length >= 12);
  });

  for (const project of projects) {
    it(`${project.slug}: round-trips without losing anything`, () => {
      const { row, keyById } = throughDatabase(project);
      const back = projectSchema.parse(rowsToProject(row));
      assert.deepEqual(comparable(back, keyById), comparable(project));
    });
  }

  it("keeps the slugs, and one row per need and offer", () => {
    for (const p of projects) {
      const rows = projectToRows(p);
      assert.equal(rows.project.slug, p.slug);
      assert.equal(rows.needs.length, p.current_needs.length);
      assert.equal(rows.offers.length, p.offers.length);
      assert.deepEqual(rows.needs.map((n) => n.key), p.current_needs.map((n) => n.id));
    }
  });

  it("produces the same connections from database rows as from the JSON files", () => {
    const fromJson = findConnections(projects).map((c) => c.id);
    const fromRows = findConnections(projects.map((p) => projectSchema.parse(rowsToProject(throughDatabase(p).row)))).map((c) => c.id);
    assert.deepEqual(fromRows, fromJson);
    assert.ok(fromJson.length > 0);
  });
});

describe("editing a project through the wizard", async () => {
  const { projects } = await readSeedProjects();
  const original = projects.find((p) => p.current_needs.length > 0 && p.offers.length > 0)!;

  it("changes nothing when nothing was changed", () => {
    const draft = draftSchema.parse(draftFromProject(original));
    assert.deepEqual(applyDraft(original, draft), original);
  });

  it("changes only what was edited and keeps the other translations", () => {
    const draft = draftSchema.parse(draftFromProject(original));
    draft.needs[0].description = "צורך שעודכן";
    draft.activity = "paused";
    const next = projectSchema.parse(applyDraft(original, draft));
    assert.equal(next.current_needs[0].description.translations.he, "צורך שעודכן");
    assert.equal(next.current_needs[0].id, original.current_needs[0].id, "the need keeps its identity");
    assert.equal(next.status.activity_status, "paused");
    assert.deepEqual(next.name, original.name);
    assert.deepEqual(next.current_needs.slice(1), original.current_needs.slice(1));
    assert.equal(next.slug, original.slug);
  });

  it("rejects malformed drafts", () => {
    const draft = draftFromProject(original);
    assert.throws(() => draftSchema.parse({ ...draft, needs: [{ ...draft.needs[0], id: "x".repeat(200) }] }));
    assert.throws(() => draftSchema.parse({ ...draft, stage: "nonsense" }));
    assert.throws(() => draftSchema.parse({ ...draft, name: "x".repeat(500) }));
  });
});
