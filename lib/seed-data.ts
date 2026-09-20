import { promises as fs } from "node:fs";
import path from "node:path";
import { projectFileSchema } from "@/lib/schema";
import type { Project, ProjectLoadIssue } from "@/types/project";

/**
 * The JSON files in /data/projects are SEED / DEMO data.
 *
 * They are read by exactly two things:
 *   1. `npm run db:seed` (scripts/seed.ts), which imports them into Supabase, and
 *   2. the "demo mode" of the data layer, used ONLY when Supabase is not configured
 *      (a fresh clone with no .env). Once SUPABASE_URL / SUPABASE_ANON_KEY are set,
 *      Supabase is the single runtime source of truth and these files are never read.
 *
 * Node-only (uses node:fs).
 */

const DATA_DIR = path.join(process.cwd(), "data", "projects");

export interface LoadedProjects {
  projects: Project[];
  issues: ProjectLoadIssue[];
}

/** Read and validate every file. A bad file is reported, never fatal. */
export async function readSeedProjects(): Promise<LoadedProjects> {
  const issues: ProjectLoadIssue[] = [];
  const projects: Project[] = [];

  let files: string[] = [];
  try {
    files = (await fs.readdir(DATA_DIR)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    issues.push({ file: "data/projects", message: "Could not read the projects directory." });
    return { projects, issues };
  }

  const seen = new Set<string>();

  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
      const parsed = projectFileSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        const detail = parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        issues.push({ file, message: `Schema validation failed — ${detail}` });
        continue;
      }
      const project = parsed.data.project;
      if (seen.has(project.slug) || seen.has(project.id)) {
        issues.push({ file, message: `Duplicate id/slug "${project.slug}" — skipped.` });
        continue;
      }
      seen.add(project.slug);
      seen.add(project.id);
      projects.push(project);
    } catch (err) {
      issues.push({
        file,
        message: err instanceof SyntaxError ? `Invalid JSON — ${err.message}` : `Could not read file — ${String(err)}`,
      });
    }
  }

  return { projects, issues };
}
