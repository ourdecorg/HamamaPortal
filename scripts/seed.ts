/**
 * Import the seed projects in /data/projects into Supabase.
 *
 *   npm run db:seed                 insert what is missing; existing projects are left exactly as they are
 *   npm run db:seed -- --update     also re-apply the JSON to projects that already exist
 *   npm run db:seed -- --dry-run    show what would happen, change nothing
 *
 * Idempotent: a project is identified by its slug, a need/offer by (project, key). Running it again never
 * creates duplicates. By DEFAULT it never overwrites anything, because after the import Supabase is the
 * source of truth and stewards edit their projects there. `--update` is for deliberately pushing a change
 * made in the JSON files; it never deletes needs/offers and never touches wishes, stewards or opportunities.
 *
 * Uses the service-role key: run it from a trusted machine (see scripts/lib/admin.ts).
 */
import { projectToRows } from "@/lib/project-mapper";
import { readSeedProjects } from "@/lib/seed-data";
import { createAdminClient, flag } from "./lib/admin";

async function main() {
  const update = flag("update");
  const dryRun = flag("dry-run");

  const { projects, issues } = await readSeedProjects();
  if (issues.length) {
    console.error("✖ Seed files with problems — fix them first (npm run check:data):");
    for (const i of issues) console.error(`   - ${i.file}: ${i.message}`);
    process.exit(1);
  }

  const admin = createAdminClient();
  const { data: existing, error } = await admin.from("projects").select("id, slug");
  if (error) throw new Error(`Could not read projects: ${error.message}`);
  const idBySlug = new Map((existing ?? []).map((r: { id: string; slug: string }) => [r.slug, r.id]));

  const counts = { created: 0, updated: 0, skipped: 0 };

  for (const project of projects) {
    const rows = projectToRows(project);
    const existingId = idBySlug.get(project.slug);

    if (existingId && !update) {
      counts.skipped += 1;
      console.log(`  skip     ${project.slug} (already in Supabase)`);
      continue;
    }
    if (dryRun) {
      console.log(`  ${existingId ? "would update" : "would create"} ${project.slug}  (${rows.needs.length} needs, ${rows.offers.length} offers)`);
      continue;
    }

    if (existingId) {
      const { created_at: _created, ...patch } = rows.project;
      void _created;
      const { error: e1 } = await admin.from("projects").update(patch).eq("id", existingId);
      if (e1) throw new Error(`${project.slug}: ${e1.message}`);
      await upsertItems(admin, "needs", existingId, rows.needs);
      await upsertItems(admin, "offers", existingId, rows.offers);
      counts.updated += 1;
      console.log(`  update   ${project.slug}`);
      continue;
    }

    const { data: created, error: e2 } = await admin.from("projects").insert(rows.project).select("id").single();
    if (e2 || !created) throw new Error(`${project.slug}: ${e2?.message ?? "no row returned"}`);
    try {
      await upsertItems(admin, "needs", created.id, rows.needs);
      await upsertItems(admin, "offers", created.id, rows.offers);
    } catch (err) {
      // Do not leave a half-imported project behind: a re-run would skip it.
      await admin.from("projects").delete().eq("id", created.id);
      throw err;
    }
    counts.created += 1;
    console.log(`  create   ${project.slug}  (${rows.needs.length} needs, ${rows.offers.length} offers)`);
  }

  console.log(`\n${dryRun ? "Dry run — nothing written. " : ""}created ${counts.created} · updated ${counts.updated} · skipped ${counts.skipped}`);
}

async function upsertItems(
  admin: ReturnType<typeof createAdminClient>,
  table: "needs" | "offers",
  projectId: string,
  items: object[],
) {
  if (!items.length) return;
  const { error } = await admin
    .from(table)
    .upsert(items.map((i) => ({ ...i, project_id: projectId })), { onConflict: "project_id,key" });
  if (error) throw new Error(`${table}: ${error.message}`);
}

main().catch((err) => {
  console.error(`\n✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
