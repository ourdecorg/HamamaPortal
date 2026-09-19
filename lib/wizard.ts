import { projectFileSchema } from "@/lib/schema";
import type { GeographyScope, LifecycleStage, LocalizedText, Project, ProjectFile } from "@/types/project";

/**
 * The "add a project" wizard's model — pure functions, no React.
 * A draft is what people type; `buildProjectFile` turns it into the exact JSON
 * that belongs in /data/projects/<slug>.json.
 */

export interface ItemDraft {
  uid: string;
  type: string;
  title: string;
  description: string;
  /** Comma separated, optional. */
  keywords: string;
}

export interface Draft {
  name: string;
  slug: string;
  slugTouched: boolean;
  tagline: string;
  short_description: string;
  vision: string;
  problem: string;
  desired_change: string;
  needs: ItemDraft[];
  offers: ItemDraft[];
  domains: string[];
  stage: LifecycleStage;
  activity: "active" | "forming" | "paused";
  scope: GeographyScope | "";
  place: string;
  collab: string[];
  website: string;
  linkedin: string;
  github: string;
  steward_name: string;
  steward_role: string;
}

let counter = 0;
export function newItem(type = "community"): ItemDraft {
  counter += 1;
  return { uid: `item-${counter}-${Math.round(Math.random() * 1e6)}`, type, title: "", description: "", keywords: "" };
}

export const emptyDraft = (): Draft => ({
  name: "",
  slug: "",
  slugTouched: false,
  tagline: "",
  short_description: "",
  vision: "",
  problem: "",
  desired_change: "",
  needs: [newItem("community")],
  offers: [newItem("knowledge")],
  domains: [],
  stage: "idea",
  activity: "active",
  scope: "",
  place: "",
  collab: [],
  website: "",
  linkedin: "",
  github: "",
  steward_name: "",
  steward_role: "",
});

/** Latin letters/digits only; Hebrew names fall back to a neutral placeholder. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "my-project";
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const he = (text: string): LocalizedText => ({ translations: { he: text.trim() } });

function keywordList(raw: string): string[] {
  return [...new Set(raw.split(/[,،]/).map((k) => k.trim()).filter(Boolean))];
}

function urlOrNull(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Structurally complete even for a half-filled draft, so it can drive the live preview. */
export function buildProject(d: Draft, placeholders = false): Project {
  const slug = d.slug || slugify(d.name);
  const name = d.name.trim() || (placeholders ? "שם המיזם" : "");

  return {
    id: slug,
    slug,
    name: { default: name, translations: { he: name } },
    tagline: he(d.tagline || (placeholders ? "במשפט אחד: מה אתם מנסים לשנות?" : "")),
    short_description: he(d.short_description),
    vision: { future_world: he(d.vision) },
    problem_space: { primary_problem: he(d.problem) },
    desired_change: he(d.desired_change),
    domains: d.domains,
    status: { lifecycle_stage: d.stage, activity_status: d.activity },
    ...(d.scope
      ? { geography: { scope: d.scope, ...(d.place.trim() ? { place: he(d.place) } : {}) } }
      : {}),
    people: {
      stewards: d.steward_name.trim()
        ? [{ name: d.steward_name.trim(), ...(d.steward_role.trim() ? { role: he(d.steward_role) } : {}) }]
        : [],
    },
    current_needs: d.needs
      .filter((n) => n.description.trim() || n.title.trim())
      .map((n, i) => ({
        id: `need-${i + 1}`,
        type: n.type,
        ...(n.title.trim() ? { title: he(n.title) } : {}),
        description: he(n.description || n.title),
        keywords: keywordList(n.keywords),
        status: "open" as const,
      })),
    offers: d.offers
      .filter((o) => o.description.trim() || o.title.trim())
      .map((o, i) => ({
        id: `offer-${i + 1}`,
        type: o.type,
        ...(o.title.trim() ? { title: he(o.title) } : {}),
        description: he(o.description || o.title),
        keywords: keywordList(o.keywords),
      })),
    collaboration_preferences: { types: d.collab },
    links: { website: urlOrNull(d.website), linkedin: urlOrNull(d.linkedin), github: urlOrNull(d.github) },
    portal: {
      visibility: "public",
      review_status: "published",
      last_updated: today(),
      is_demo: false,
    },
  };
}

export function buildProjectFile(d: Draft): ProjectFile {
  return {
    schema_version: "1.0",
    _comment: "Created with the Hamama portal wizard. Place this file in /data/projects/ to publish it.",
    project: buildProject(d),
  };
}

export type StepId = "identity" | "intent" | "needs" | "offers" | "details" | "review";

export const STEPS: { id: StepId; label: string }[] = [
  { id: "identity", label: "מי אתם" },
  { id: "intent", label: "למה" },
  { id: "needs", label: "מה צריך" },
  { id: "offers", label: "מה אפשר להציע" },
  { id: "details", label: "פרטים" },
  { id: "review", label: "סיכום" },
];

/** Minimal, kind validation per step. Returns Hebrew messages keyed by field. */
export function validateStep(step: StepId, d: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === "identity") {
    if (!d.name.trim()) errors.name = "איך קוראים למיזם?";
    if (!d.tagline.trim()) errors.tagline = "משפט אחד שמסביר מה אתם עושים.";
    if (!d.short_description.trim()) errors.short_description = "כמה משפטים שיעזרו למישהו להבין במה מדובר.";
    if (!SLUG_PATTERN.test(d.slug || slugify(d.name))) errors.slug = "רק אותיות לטיניות קטנות, ספרות ומקפים.";
  }
  if (step === "intent") {
    if (!d.vision.trim()) errors.vision = "איזה עולם אתם רוצים לראות?";
    if (!d.problem.trim()) errors.problem = "מה לא עובד היום?";
    if (!d.desired_change.trim()) errors.desired_change = "מה בדיוק אתם רוצים לשנות?";
  }
  if (step === "details") {
    if (d.domains.length === 0) errors.domains = "בחרו לפחות תחום אחד.";
  }
  return errors;
}

export function validateFile(file: ProjectFile): string[] {
  const parsed = projectFileSchema.safeParse(file);
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}
