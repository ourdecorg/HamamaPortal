import { z } from "zod";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/he";
import { t } from "@/lib/locale";
import {
  activityStatusSchema,
  geographyScopeSchema,
  lifecycleStageSchema,
  needStatusSchema,
  projectFileSchema,
} from "@/lib/schema";
import type { GeographyScope, LifecycleStage, LocalizedText, Need, Offer, Project, ProjectFile, Steward } from "@/types/project";

/**
 * The "add a project" wizard's model — pure functions, no React.
 * A draft is what people type; `buildProjectFile` turns it into the exact JSON
 * that belongs in /data/projects/<slug>.json.
 *
 * Language: what people type is stored under the language of the page they typed it on (`translations[locale]`),
 * so an English visitor's project is an English project. Error messages are passed in by the caller, in the
 * visitor's language — this module never imports the dictionaries (client code imports it).
 * The server-side entry point, `prepareNewProject`, is in lib/wizard-server.ts.
 */

export interface ItemDraft {
  uid: string;
  type: string;
  title: string;
  description: string;
  /** Comma separated, optional. */
  keywords: string;
  /** Edit mode: the id of the existing need/offer this draft item stands for. New items have none. */
  id?: string;
  /** Needs only, edit mode: open / in conversation / fulfilled. */
  status?: Need["status"];
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
/** /projects/new is the add-project route. */
const RESERVED_SLUG = "new";

/** A text written in `locale`. */
const localized = (locale: Locale, text: string): LocalizedText => ({ translations: { [locale]: text.trim() } });

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

/** What the live preview shows for a field that is still empty. */
export interface PreviewPlaceholders {
  name: string;
  tagline: string;
}

/** Structurally complete even for a half-filled draft, so it can drive the live preview. */
export function buildProject(
  d: Draft,
  placeholders: PreviewPlaceholders | false = false,
  locale: Locale = DEFAULT_LOCALE,
): Project {
  const he = (text: string) => localized(locale, text);
  const slug = d.slug || slugify(d.name);
  const name = d.name.trim() || (placeholders ? placeholders.name : "");

  return {
    id: slug,
    slug,
    name: { default: name, translations: { [locale]: name } },
    tagline: he(d.tagline || (placeholders ? placeholders.tagline : "")),
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

export function buildProjectFile(d: Draft, locale: Locale = DEFAULT_LOCALE): ProjectFile {
  return {
    schema_version: "1.0",
    _comment: "Created with the Hamama portal wizard. Place this file in /data/projects/ to publish it.",
    project: buildProject(d, false, locale),
  };
}

// ------------------------------------------------------------ edit mode ------

/** A Draft filled from an existing project (as read in `locale`), so the wizard can edit it. */
export function draftFromProject(p: Project, locale: Locale = DEFAULT_LOCALE): Draft {
  const steward = p.people.stewards[0];
  return {
    name: t(p.name, locale),
    slug: p.slug,
    slugTouched: true,
    tagline: t(p.tagline, locale),
    short_description: t(p.short_description, locale),
    vision: t(p.vision.future_world, locale),
    problem: t(p.problem_space.primary_problem, locale),
    desired_change: t(p.desired_change, locale),
    needs: p.current_needs.map((n) => ({
      uid: `need-${n.id}`,
      id: n.id,
      type: n.type,
      title: t(n.title, locale),
      description: t(n.description, locale),
      keywords: n.keywords.join(", "),
      status: n.status,
    })),
    offers: p.offers.map((o) => ({
      uid: `offer-${o.id}`,
      id: o.id,
      type: o.type,
      title: t(o.title, locale),
      description: t(o.description, locale),
      keywords: o.keywords.join(", "),
    })),
    domains: p.domains,
    stage: p.status.lifecycle_stage,
    activity: p.status.activity_status,
    scope: p.geography?.scope ?? "",
    place: t(p.geography?.place, locale),
    collab: p.collaboration_preferences.types,
    website: p.links.website ?? "",
    linkedin: p.links.linkedin ?? "",
    github: p.links.github ?? "",
    steward_name: steward?.name ?? "",
    steward_role: t(steward?.role, locale),
  };
}

/**
 * Set the text of a localized value in `locale`. Unchanged text keeps the original object untouched, and
 * a changed text keeps every other translation (the wizard only shows one language).
 * `default` follows the edit only when it is what the editor was looking at AND the editor is in the
 * default language — a visitor editing in English never overwrites the Hebrew default.
 */
function mergeLocalized(original: LocalizedText | undefined, next: string, locale: Locale): LocalizedText {
  const value = next.trim();
  if (!original) return localized(locale, value);
  const shown = t(original, locale);
  if (shown === value) return original;
  const followsDefault = locale === DEFAULT_LOCALE && original.default === shown;
  return {
    ...(original.default !== undefined ? { default: followsDefault ? value : original.default } : {}),
    translations: { ...original.translations, [locale]: value },
  };
}

/** Like mergeLocalized, for optional fields: empty text means "no value". */
function optionalLocalized(original: LocalizedText | undefined, next: string, locale: Locale): LocalizedText | undefined {
  return next.trim() ? mergeLocalized(original, next, locale) : undefined;
}

function applyStewards(original: Steward[], d: Draft, locale: Locale): Steward[] {
  const name = d.steward_name.trim();
  if (!name) return original;
  const { role: oldRole, ...rest } = original[0] ?? { name };
  const role = optionalLocalized(oldRole, d.steward_role, locale);
  return [{ ...rest, name, ...(role ? { role } : {}) }, ...original.slice(1)];
}

/**
 * The project as it should be after the wizard's edits. Identity (id, slug) and moderation state
 * (`portal`) always come from the ORIGINAL — a steward cannot change them through a draft.
 * Existing needs/offers keep their id; new ones get a temporary `new-N` id.
 */
export function applyDraft(original: Project, d: Draft, locale: Locale = DEFAULT_LOCALE): Project {
  const needById = new Map(original.current_needs.map((n) => [n.id, n]));
  const offerById = new Map(original.offers.map((o) => [o.id, o]));
  const place = optionalLocalized(original.geography?.place, d.place, locale);

  return {
    ...original,
    name: mergeLocalized(original.name, d.name, locale),
    tagline: mergeLocalized(original.tagline, d.tagline, locale),
    short_description: mergeLocalized(original.short_description, d.short_description, locale),
    vision: { future_world: mergeLocalized(original.vision.future_world, d.vision, locale) },
    problem_space: { primary_problem: mergeLocalized(original.problem_space.primary_problem, d.problem, locale) },
    desired_change: mergeLocalized(original.desired_change, d.desired_change, locale),
    domains: d.domains,
    status: { lifecycle_stage: d.stage, activity_status: d.activity },
    geography: d.scope ? { scope: d.scope, ...(place ? { place } : {}) } : undefined,
    people: { stewards: applyStewards(original.people.stewards, d, locale) },
    current_needs: d.needs
      .filter((n) => n.description.trim() || n.title.trim())
      .map((n, i): Need => {
        const before = n.id ? needById.get(n.id) : undefined;
        const title = optionalLocalized(before?.title, n.title, locale);
        return {
          id: before?.id ?? `new-${i + 1}`,
          type: n.type,
          ...(title ? { title } : {}),
          description: mergeLocalized(before?.description, n.description || n.title, locale),
          keywords: keywordList(n.keywords),
          status: n.status ?? before?.status ?? "open",
        };
      }),
    offers: d.offers
      .filter((o) => o.description.trim() || o.title.trim())
      .map((o, i): Offer => {
        const before = o.id ? offerById.get(o.id) : undefined;
        const title = optionalLocalized(before?.title, o.title, locale);
        return {
          id: before?.id ?? `new-${i + 1}`,
          type: o.type,
          ...(title ? { title } : {}),
          description: mergeLocalized(before?.description, o.description || o.title, locale),
          keywords: keywordList(o.keywords),
        };
      }),
    collaboration_preferences: { types: d.collab },
    links: { website: urlOrNull(d.website), linkedin: urlOrNull(d.linkedin), github: urlOrNull(d.github) },
  };
}

const keyPattern = /^[a-z][a-z0-9_]*$/;

const itemDraftSchema = z.object({
  uid: z.string().max(120),
  id: z.string().min(1).max(64).optional(),
  type: z.string().regex(keyPattern),
  title: z.string().max(200),
  description: z.string().max(1500),
  keywords: z.string().max(400),
  status: needStatusSchema.optional(),
});

/** Server-side validation of a draft sent from the browser. Never trust the client's shape. */
export const draftSchema: z.ZodType<Draft> = z.object({
  name: z.string().max(200),
  slug: z.string().max(80),
  slugTouched: z.boolean(),
  tagline: z.string().max(300),
  short_description: z.string().max(3000),
  vision: z.string().max(6000),
  problem: z.string().max(6000),
  desired_change: z.string().max(6000),
  needs: z.array(itemDraftSchema).max(20),
  offers: z.array(itemDraftSchema).max(20),
  domains: z.array(z.string().regex(keyPattern)).max(12),
  stage: lifecycleStageSchema,
  activity: activityStatusSchema,
  scope: z.union([geographyScopeSchema, z.literal("")]),
  place: z.string().max(200),
  collab: z.array(z.string().regex(keyPattern)).max(12),
  website: z.string().max(300),
  linkedin: z.string().max(300),
  github: z.string().max(300),
  steward_name: z.string().max(120),
  steward_role: z.string().max(120),
});

export type StepId = "identity" | "intent" | "needs" | "offers" | "details" | "review";

/** The wizard's steps, in order. Their labels are in the dictionaries (wizard.steps). */
export const STEP_IDS: StepId[] = ["identity", "intent", "needs", "offers", "details", "review"];

/** The wizard's validation messages (Messages["wizard"]["errors"]), in the visitor's language. */
export type WizardErrors = Messages["wizard"]["errors"];

/** Minimal, kind validation per step. Returns messages keyed by field. */
export function validateStep(step: StepId, d: Draft, messages: WizardErrors): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === "identity") {
    if (!d.name.trim()) errors.name = messages.name;
    if (!d.tagline.trim()) errors.tagline = messages.tagline;
    if (!d.short_description.trim()) errors.short_description = messages.shortDescription;
    const slug = d.slug || slugify(d.name);
    if (!SLUG_PATTERN.test(slug)) errors.slug = messages.slug;
    else if (slug === RESERVED_SLUG) errors.slug = messages.slugReserved;
  }
  if (step === "intent") {
    if (!d.vision.trim()) errors.vision = messages.vision;
    if (!d.problem.trim()) errors.problem = messages.problem;
    if (!d.desired_change.trim()) errors.desired_change = messages.desiredChange;
  }
  if (step === "details") {
    if (d.domains.length === 0) errors.domains = messages.domains;
  }
  return errors;
}

export function validateFile(file: ProjectFile): string[] {
  const parsed = projectFileSchema.safeParse(file);
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}
