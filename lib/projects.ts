import { cache } from "react";
import { t } from "@/lib/locale";
import { connectionsFor, findConnections, findUnmetNeeds, type Connection, type UnmetNeed } from "@/lib/matching";
import { rowsToProject, type ProjectWithItems } from "@/lib/project-mapper";
import { filterProjects, hasOpenNeed, type ProjectFilters, type SearchHit } from "@/lib/search";
import { projectSchema } from "@/lib/schema";
import { readSeedProjects, type LoadedProjects } from "@/lib/seed-data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/server";
import { domainLabel } from "@/lib/taxonomy";
import type { Project, ProjectLoadIssue } from "@/types/project";

/**
 * The data access layer — the ONLY place that knows where projects live.
 *
 * Runtime source of truth: Supabase (tables `projects`, `needs`, `offers`), read with the anonymous
 * key so RLS returns exactly the public catalogue. The JSON files in /data/projects are seed data
 * (see scripts/seed.ts); they are read here ONLY in demo mode, when Supabase is not configured.
 *
 * Pages and components call the functions exported here and never see either backend.
 * Server-only (Supabase client + node:fs in demo mode). Client components import the pure modules
 * (search, matching, taxonomy) instead.
 */

type Loaded = LoadedProjects;

let warnedDemoMode = false;

/** Public catalogue from Supabase. A malformed row is reported, never fatal; a failed query is. */
async function readFromSupabase(): Promise<Loaded> {
  const { data, error } = await createPublicClient()
    .from("projects")
    .select("*, needs(*), offers(*)")
    .eq("review_status", "published")
    .neq("visibility", "private");
  if (error) throw new Error(`Could not load projects from Supabase: ${error.message}`);

  const projects: Project[] = [];
  const issues: ProjectLoadIssue[] = [];
  for (const row of (data ?? []) as ProjectWithItems[]) {
    const parsed = projectSchema.safeParse(rowsToProject(row));
    if (parsed.success) {
      projects.push(parsed.data);
    } else {
      const detail = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      issues.push({ file: `projects/${row.slug}`, message: `Schema validation failed — ${detail}` });
    }
  }
  if (issues.length && process.env.NODE_ENV !== "production") {
    for (const issue of issues) console.warn(`[hamama] skipped ${issue.file}: ${issue.message}`);
  }
  return { projects, issues };
}

async function readAll(): Promise<Loaded> {
  if (isSupabaseConfigured()) return readFromSupabase();
  if (!warnedDemoMode) {
    warnedDemoMode = true;
    console.warn("[hamama] Supabase is not configured — serving the read-only JSON demo data from /data/projects.");
  }
  return readSeedProjects();
}

/** Memoised per request. */
const loadAll = cache(readAll);

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

/** Records that were found but could not be used (malformed JSON / rows, schema errors). */
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
