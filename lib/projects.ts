import { cache } from "react";
import { promises as fs } from "node:fs";
import path from "node:path";
import { t } from "@/lib/locale";
import { connectionsFor, findConnections, findUnmetNeeds, type Connection, type UnmetNeed } from "@/lib/matching";
import { filterProjects, hasOpenNeed, type ProjectFilters, type SearchHit } from "@/lib/search";
import { domainLabel } from "@/lib/taxonomy";
import { projectFileSchema } from "@/lib/schema";
import type { Project, ProjectLoadIssue } from "@/types/project";

/**
 * The data access layer — the ONLY place that knows projects live in JSON files.
 *
 * Pages and components call the functions exported here and never touch the
 * filesystem. To move to a database later, re-implement `loadAll()` (or the
 * exported functions) and keep their signatures; nothing else has to change.
 *
 * Server-only: this module uses node:fs. Client components should import the
 * pure modules (search, matching, taxonomy) instead.
 */

const DATA_DIR = path.join(process.cwd(), "data", "projects");

interface Loaded {
  projects: Project[];
  issues: ProjectLoadIssue[];
}

/** Read and validate every file. A bad file is reported, never fatal. */
async function readAllFromDisk(): Promise<Loaded> {
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

  if (issues.length && process.env.NODE_ENV !== "production") {
    for (const issue of issues) console.warn(`[hamama] skipped ${issue.file}: ${issue.message}`);
  }
  return { projects, issues };
}

/** Memoised per request (and per static render). Files are re-read on the next request. */
const loadAll = cache(readAllFromDisk);

function isListed(p: Project): boolean {
  return p.portal.review_status === "published" && p.portal.visibility === "public";
}

function byRecency(a: Project, b: Project): number {
  return b.portal.last_updated.localeCompare(a.portal.last_updated) || t(a.name).localeCompare(t(b.name), "he");
}

// ------------------------------------------------------------------ reads ---

/** All published, public projects — most recently updated first. */
export async function getProjects(): Promise<Project[]> {
  const { projects } = await loadAll();
  return projects.filter(isListed).sort(byRecency);
}

/** One project by slug. Unlisted projects are reachable by link; drafts are not. */
export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const { projects } = await loadAll();
  return (
    projects.find(
      (p) => p.slug === slug && p.portal.review_status === "published" && p.portal.visibility !== "private",
    ) ?? null
  );
}

/** Files that were found but could not be used (malformed JSON, schema errors). */
export async function getLoadIssues(): Promise<ProjectLoadIssue[]> {
  return (await loadAll()).issues;
}

export async function searchProjects(filters: ProjectFilters = {}): Promise<SearchHit[]> {
  return filterProjects(await getProjects(), filters);
}

export interface DomainSummary {
  key: string;
  label: string;
  count: number;
}

/** Domains in use, busiest first. */
export async function getDomains(): Promise<DomainSummary[]> {
  const counts = new Map<string, number>();
  for (const p of await getProjects()) {
    for (const d of p.domains) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: domainLabel(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "he"));
}

// ------------------------------------------------------------ connections ---

const loadConnections = cache(async (): Promise<Connection[]> => findConnections(await getProjects()));

/** Every possible connection in the ecosystem, strongest signal first. */
export async function getConnections(): Promise<Connection[]> {
  return loadConnections();
}

/** Connections involving one project (as the one with the need or the one offering). */
export async function getSuggestedConnections(slug: string): Promise<Connection[]> {
  const project = await getProjectBySlug(slug);
  if (!project) return [];
  return connectionsFor(await loadConnections(), project.id);
}

/** Open needs that nothing in the ecosystem answers yet. */
export async function getUnmetNeeds(): Promise<UnmetNeed[]> {
  return findUnmetNeeds(await getProjects());
}

// ------------------------------------------------------------------ stats ---

export interface EcosystemStats {
  active_projects: number;
  open_needs: number;
  offers: number;
  possible_connections: number;
}

export async function getEcosystemStats(): Promise<EcosystemStats> {
  const projects = await getProjects();
  return {
    active_projects: projects.filter((p) => p.status.activity_status === "active").length,
    open_needs: projects.reduce((n, p) => n + p.current_needs.filter((x) => x.status === "open").length, 0),
    offers: projects.reduce((n, p) => n + p.offers.length, 0),
    possible_connections: (await loadConnections()).length,
  };
}

/**
 * Projects with especially clear open needs — for the "seeking collaboration"
 * showcase. Prefers projects with several open needs, then variety of domains.
 */
export async function getSeekingProjects(count: number): Promise<Project[]> {
  const candidates = (await getProjects())
    .filter(hasOpenNeed)
    .sort(
      (a, b) =>
        b.current_needs.filter((n) => n.status === "open").length -
          a.current_needs.filter((n) => n.status === "open").length || byRecency(a, b),
    );

  const picked: Project[] = [];
  const domainsSeen = new Set<string>();
  for (const p of candidates) {
    if (picked.length >= count) break;
    if (p.domains.every((d) => domainsSeen.has(d))) continue;
    picked.push(p);
    p.domains.forEach((d) => domainsSeen.add(d));
  }
  for (const p of candidates) {
    if (picked.length >= count) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked;
}
