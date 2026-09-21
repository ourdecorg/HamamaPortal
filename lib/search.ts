import { allVariants } from "@/lib/locale";
import { domainInfo, exchangeType } from "@/lib/taxonomy";
import { stems, stemsWithWords } from "@/lib/text";
import type { LifecycleStage, Project } from "@/types/project";

/**
 * Local keyword search with a simple, explainable relevance score.
 *
 * It is NOT semantic search. Each field of a project is reduced to word stems;
 * a query word scores when it (or a prefix of it) appears in a field, weighted
 * by how much that field says about "what the project is". The result also
 * tells the UI *where* the query matched so we can show it.
 */

export type SearchField =
  | "name"
  | "tagline"
  | "description"
  | "vision"
  | "problem"
  | "change"
  | "domains"
  | "needs"
  | "offers";

const FIELD_WEIGHTS: Record<SearchField, number> = {
  name: 6,
  tagline: 3.5,
  domains: 3.5,
  needs: 3,
  offers: 3,
  description: 2,
  vision: 1.5,
  problem: 1.5,
  change: 1.5,
};

type FieldIndex = Record<SearchField, Set<string>>;

const indexCache = new WeakMap<Project, FieldIndex>();

function textOf(...parts: (string | undefined | null | string[])[]): string {
  return parts
    .flat()
    .filter(Boolean)
    .join(" ");
}

function buildIndex(p: Project): FieldIndex {
  const fields: Record<SearchField, string> = {
    name: textOf(allVariants(p.name)),
    tagline: textOf(allVariants(p.tagline)),
    description: textOf(allVariants(p.short_description)),
    vision: textOf(allVariants(p.vision.future_world)),
    problem: textOf(allVariants(p.problem_space.primary_problem)),
    change: textOf(allVariants(p.desired_change)),
    domains: textOf(
      p.domains.flatMap((d) => {
        const info = domainInfo(d);
        return [d.replace(/_/g, " "), info.he, info.en, info.blurb.he, info.blurb.en];
      }),
    ),
    needs: textOf(
      p.current_needs.flatMap((n) => [
        ...allVariants(n.title),
        ...allVariants(n.description),
        ...n.keywords,
        exchangeType(n.type).he,
        exchangeType(n.type).en,
      ]),
    ),
    offers: textOf(
      p.offers.flatMap((o) => [
        ...allVariants(o.title),
        ...allVariants(o.description),
        ...o.keywords,
        exchangeType(o.type).he,
        exchangeType(o.type).en,
      ]),
    ),
  };
  const index = {} as FieldIndex;
  for (const key of Object.keys(fields) as SearchField[]) {
    index[key] = new Set(stems(fields[key]));
  }
  return index;
}

function indexFor(p: Project): FieldIndex {
  let idx = indexCache.get(p);
  if (!idx) {
    idx = buildIndex(p);
    indexCache.set(p, idx);
  }
  return idx;
}

/** 1 for an exact stem hit, 0.5 for a prefix hit (either direction), else 0. */
function termMatch(term: string, field: Set<string>): number {
  if (field.has(term)) return 1;
  if (term.length < 3) return 0;
  for (const s of field) {
    if (s.length >= 3 && (s.startsWith(term) || term.startsWith(s))) return 0.5;
  }
  return 0;
}

export interface SearchHit {
  project: Project;
  /** Higher is more relevant. Only meaningful for ordering. */
  score: number;
  matched_fields: SearchField[];
  /** The user's own words that matched something. */
  matched_terms: string[];
}

export function scoreProject(project: Project, query: string): SearchHit {
  const words = stemsWithWords(query);
  if (words.size === 0) return { project, score: 0, matched_fields: [], matched_terms: [] };

  const idx = indexFor(project);
  let total = 0;
  const matchedTerms = new Set<string>();
  const matchedFields = new Map<SearchField, number>();

  for (const [term, original] of words) {
    for (const field of Object.keys(FIELD_WEIGHTS) as SearchField[]) {
      const m = termMatch(term, idx[field]);
      if (m > 0) {
        total += FIELD_WEIGHTS[field] * m;
        matchedTerms.add(original);
        matchedFields.set(field, (matchedFields.get(field) ?? 0) + FIELD_WEIGHTS[field] * m);
      }
    }
  }

  // Reward projects that cover more of what was asked for.
  const coverage = matchedTerms.size / words.size;
  const score = total * (0.5 + 0.5 * coverage);

  return {
    project,
    score,
    matched_fields: [...matchedFields.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f),
    matched_terms: [...matchedTerms],
  };
}

export interface ProjectFilters {
  query?: string;
  /** Match ANY of these domains. */
  domains?: string[];
  stage?: LifecycleStage | null;
  /** "needs": has an open need · "offers": has something to offer · "any": no filter */
  exchange?: "any" | "needs" | "offers";
}

export function hasOpenNeed(p: Project): boolean {
  return p.current_needs.some((n) => n.status === "open");
}

export function filterProjects(projects: Project[], filters: ProjectFilters = {}): SearchHit[] {
  const query = filters.query?.trim() ?? "";
  const domains = filters.domains ?? [];

  let hits: SearchHit[] = projects.map((project) => ({
    project,
    score: 0,
    matched_fields: [],
    matched_terms: [],
  }));

  if (domains.length) {
    hits = hits.filter((h) => h.project.domains.some((d) => domains.includes(d)));
  }
  if (filters.stage) {
    hits = hits.filter((h) => h.project.status.lifecycle_stage === filters.stage);
  }
  if (filters.exchange === "needs") hits = hits.filter((h) => hasOpenNeed(h.project));
  if (filters.exchange === "offers") hits = hits.filter((h) => h.project.offers.length > 0);

  if (query) {
    hits = hits
      .map((h) => scoreProject(h.project, query))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score);
  }
  return hits;
}
