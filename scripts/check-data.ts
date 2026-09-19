/**
 * Validate every file in /data/projects and (optionally) print the connections
 * the local matching engine finds.
 *
 *   npm run check:data
 *   npm run check:data -- --connections
 */
import { getConnections, getEcosystemStats, getLoadIssues, getProjects } from "@/lib/projects";
import { signalStrength } from "@/lib/matching";

async function main() {
  const [projects, issues, stats] = await Promise.all([getProjects(), getLoadIssues(), getEcosystemStats()]);

  console.log(`\n✔ ${projects.length} project(s) loaded`);
  for (const p of projects) console.log(`   - ${p.slug}${p.portal.is_demo ? "  (demo)" : ""}`);

  if (issues.length) {
    console.log(`\n✖ ${issues.length} file(s) skipped:`);
    for (const i of issues) console.log(`   - ${i.file}: ${i.message}`);
  }

  console.log("\nStats:", stats);

  if (process.argv.includes("--connections")) {
    const connections = await getConnections();
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
