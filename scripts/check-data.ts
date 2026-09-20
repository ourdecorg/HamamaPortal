/**
 * Validate every seed file in /data/projects and (optionally) print the connections
 * the matching engine finds among them. Works offline — no Supabase needed.
 *
 *   npm run check:data
 *   npm run check:data -- --connections
 */
import { findConnections, signalStrength } from "@/lib/matching";
import { readSeedProjects } from "@/lib/seed-data";

async function main() {
  const { projects, issues } = await readSeedProjects();

  console.log(`\n✔ ${projects.length} project(s) loaded`);
  for (const p of projects) console.log(`   - ${p.slug}${p.portal.is_demo ? "  (demo)" : ""}`);

  if (issues.length) {
    console.log(`\n✖ ${issues.length} file(s) skipped:`);
    for (const i of issues) console.log(`   - ${i.file}: ${i.message}`);
  }

  const connections = findConnections(projects);
  console.log("\nStats:", {
    active_projects: projects.filter((p) => p.status.activity_status === "active").length,
    open_needs: projects.reduce((n, p) => n + p.current_needs.filter((x) => x.status === "open").length, 0),
    offers: projects.reduce((n, p) => n + p.offers.length, 0),
    possible_connections: connections.length,
  });

  if (process.argv.includes("--connections")) {
    console.log(`\n${connections.length} connection(s):\n`);
    for (const c of connections) {
      const s = signalStrength(c.confidence);
      console.log(
        `${c.project_a.slug} (needs ${c.need.type}) ⇢ ${c.project_b.slug} (offers ${c.offer.type})  ` +
          `[${c.confidence.toFixed(2)} · ${s.label}${c.reciprocal ? " · reciprocal" : ""}]`,
      );
      console.log(`     ${c.summary}`);
    }
  }
  process.exit(issues.length ? 1 : 0);
}

main();
