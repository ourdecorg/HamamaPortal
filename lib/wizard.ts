import { z } from "zod";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/he";
import {
  activityStatusSchema,
  geographyScopeSchema,
  lifecycleStageSchema,
  machineMarkSchema,
  needStatusSchema,
  projectFileSchema,
} from "@/lib/schema";
import type {
  GeographyScope,
  LifecycleStage,
  LocalizedText,
  MachineMark,
  Need,
  Offer,
  Project,
  ProjectFile,
  Steward,
} from "@/types/project";

/**
 * The "add a project" wizard's model — pure functions, no React.
 * A draft is what people type; `buildProjectFile` turns it into the exact JSON
 * that belongs in /data/projects/<slug>.json.
 *
 * Language: the main fields of a draft are in the language of the page (`locale`) and are stored under
 * `translations[locale]`, so an English visitor's project is an English project. The same texts in the
 * other languages live in `draft.translations` / `item.translations`; each language is saved on its own and
 * never overwrites another. Error messages are passed in by the caller, in the visitor's language — this
 * module never imports the dictionaries (client code imports it).
 * The server-side entry point, `prepareNewProject`, is in lib/wizard-server.ts.
 */

/** The free-text fields of a draft that exist once per language. */
export const DRAFT_TEXT_FIELDS = [
  "name",
  "tagline",
  "short_description",
  "vision",
  "problem",
  "desired_change",
  "place",
  "steward_role",
] as const;
export type DraftTextField = (typeof DRAFT_TEXT_FIELDS)[number];
export type DraftTexts = Record<DraftTextField, string>;

export const ITEM_TEXT_FIELDS = ["title", "description"] as const;
export type ItemTexts = Record<(typeof ITEM_TEXT_FIELDS)[number], string>;

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
  /** Title and description in the other languages (the fields above are in the page's language). */
  translations?: Partial<Record<Locale, ItemTexts>>;
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
  /** The text fields above, in the other languages. */
  translations: Partial<Record<Locale, DraftTexts>>;
  /**
   * Texts that are still exactly what the automatic translation produced, keyed `${locale}|${textKey}`.
   * Editing a text by hand removes its mark.
   */
  machine: Record<string, MachineMark>;
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
  translations: {},
  machine: {},
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

// ------------------------------------------------------ texts per language ---

/**
 * Every translatable text of a draft has a key: the field name for the project's own texts ("tagline"),
 * and "need:<uid>:title" / "offer:<uid>:description" for needs and offers.
 */
export function itemTextKey(kind: "need" | "offer", uid: string, field: keyof ItemTexts): string {
  return `${kind}:${uid}:${field}`;
}

const markKey = (lang: Locale, key: string) => `${lang}|${key}`;

const emptyTexts = (): DraftTexts => Object.fromEntries(DRAFT_TEXT_FIELDS.map((f) => [f, ""])) as DraftTexts;

const itemLists = (d: Draft) =>
  [
    ["need", "needs", d.needs],
    ["offer", "offers", d.offers],
  ] as const;

/** All texts of the draft in `lang`, by text key. `page` is the language of the draft's main fields. */
export function readTexts(d: Draft, lang: Locale, page: Locale): Record<string, string> {
  const main = lang === page ? d : d.translations[lang];
  const out: Record<string, string> = {};
  for (const f of DRAFT_TEXT_FIELDS) out[f] = main?.[f] ?? "";
  for (const [kind, , list] of itemLists(d)) {
    for (const item of list) {
      const texts = lang === page ? item : item.translations?.[lang];
      for (const f of ITEM_TEXT_FIELDS) out[itemTextKey(kind, item.uid, f)] = texts?.[f] ?? "";
    }
  }
  return out;
}

/**
 * Set texts of the draft in `lang` (only the keys given). With `mark` they are recorded as automatic
 * translations; without it they count as written by hand and any earlier mark is removed.
 */
export function writeTexts(
  d: Draft,
  lang: Locale,
  page: Locale,
  values: Record<string, string>,
  mark?: MachineMark,
): Draft {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(values, key);
  const machine = { ...d.machine };
  for (const key of Object.keys(values)) {
    if (mark) machine[markKey(lang, key)] = mark;
    else delete machine[markKey(lang, key)];
  }

  const fields = DRAFT_TEXT_FIELDS.filter(has);
  const patch = Object.fromEntries(fields.map((f) => [f, values[f]])) as Partial<DraftTexts>;
  let next: Draft = { ...d, machine };
  if (fields.length) {
    next =
      lang === page
        ? { ...next, ...patch }
        : { ...next, translations: { ...d.translations, [lang]: { ...emptyTexts(), ...d.translations[lang], ...patch } } };
  }

  for (const [kind, listKey, list] of itemLists(d)) {
    next = {
      ...next,
      [listKey]: list.map((item) => {
        const itemPatch: Partial<ItemTexts> = {};
        for (const f of ITEM_TEXT_FIELDS) {
          const key = itemTextKey(kind, item.uid, f);
          if (has(key)) itemPatch[f] = values[key];
        }
        if (!Object.keys(itemPatch).length) return item;
        if (lang === page) return { ...item, ...itemPatch };
        const before = item.translations?.[lang] ?? { title: "", description: "" };
        return { ...item, translations: { ...item.translations, [lang]: { ...before, ...itemPatch } } };
      }),
    };
  }
  return next;
}

/** The draft without the automatic-translation marks of these texts (they were edited by hand). */
export function clearMarks(d: Draft, lang: Locale, keys: string[]): Draft {
  if (!keys.some((key) => markKey(lang, key) in d.machine)) return d;
  const machine = { ...d.machine };
  for (const key of keys) delete machine[markKey(lang, key)];
  return { ...d, machine };
}

/** Is this text in `lang` still an unedited automatic translation? */
export function machineMark(d: Draft, lang: Locale, key: string): MachineMark | undefined {
  return d.machine[markKey(lang, key)];
}

/**
 * What an automatic translation from `from` sends: every non-empty text except the name, which is never
 * machine-translated (people choose their initiative's name in each language themselves).
 */
export function translationSource(d: Draft, from: Locale, page: Locale): Record<string, string> {
  return Object.fromEntries(
    Object.entries(readTexts(d, from, page)).filter(([key, text]) => key !== "name" && text.trim()),
  );
}

type LocaleValues = Partial<Record<Locale, string>>;

/** A draft field in every language the draft holds. */
function fieldValues(d: Draft, page: Locale, field: DraftTextField): LocaleValues {
  const out: LocaleValues = { [page]: d[field] };
  for (const lang of LOCALES) {
    const texts = d.translations[lang];
    if (lang !== page && texts) out[lang] = texts[field];
  }
  return out;
}

function itemValues(item: ItemDraft, page: Locale, field: keyof ItemTexts): LocaleValues {
  const out: LocaleValues = { [page]: item[field] };
  for (const lang of LOCALES) {
    const texts = item.translations?.[lang];
    if (lang !== page && texts) out[lang] = texts[field];
  }
  return out;
}

/** A need/offer description falls back to its title, language by language. */
function descriptionValues(item: ItemDraft, page: Locale): LocaleValues {
  const titles = itemValues(item, page, "title");
  const descriptions = itemValues(item, page, "description");
  const out: LocaleValues = {};
  for (const lang of LOCALES) {
    const value = descriptions[lang]?.trim() ? descriptions[lang] : titles[lang];
    if (value !== undefined) out[lang] = value;
  }
  return out;
}

const hasAny = (values: LocaleValues) => Object.values(values).some((v) => v?.trim());

/** The automatic-translation marks for one text — only for languages that actually have text. */
function marksFor(d: Draft, key: string, values: LocaleValues): LocalizedText["machine"] {
  const out: NonNullable<LocalizedText["machine"]> = {};
  for (const lang of LOCALES) {
    const mark = d.machine[markKey(lang, key)];
    if (mark && values[lang]?.trim()) out[lang] = mark;
  }
  return Object.keys(out).length ? out : undefined;
}

function sameMarks(a: LocalizedText["machine"], b: LocalizedText["machine"]): boolean {
  return LOCALES.every((l) => a?.[l]?.from === b?.[l]?.from && a?.[l]?.at === b?.[l]?.at);
}

/** A new localized text from the values the draft holds. */
function freshText(values: LocaleValues, machine: LocalizedText["machine"], page: Locale): LocalizedText {
  const translations: LocalizedText["translations"] = {};
  for (const lang of LOCALES) {
    const value = values[lang]?.trim();
    if (value) translations[lang] = value;
  }
  // Nothing in any language: keep the (empty) page-language slot, so validation can point at it.
  if (!Object.keys(translations).length) translations[page] = "";
  return { translations, ...(machine ? { machine } : {}) };
}

// ------------------------------------------------------------- create mode ---

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
  const text = (key: string, values: LocaleValues) => freshText(values, marksFor(d, key, values), locale);
  const field = (f: DraftTextField) => text(f, fieldValues(d, locale, f));
  const slug = d.slug || slugify(d.name);

  // The name is never machine-translated. `default` is the name as first written (the page's language).
  const names = fieldValues(d, locale, "name");
  const firstName = [names[locale], ...LOCALES.map((l) => names[l])].find((n) => n?.trim())?.trim();
  const name = firstName || (placeholders ? placeholders.name : "");
  const nameTranslations = firstName ? freshText(names, undefined, locale).translations : { [locale]: name };

  const taglines = fieldValues(d, locale, "tagline");
  const place = fieldValues(d, locale, "place");
  const role = fieldValues(d, locale, "steward_role");

  const items = (kind: "need" | "offer", list: ItemDraft[]) =>
    list
      .filter((it) => hasAny(itemValues(it, locale, "title")) || hasAny(itemValues(it, locale, "description")))
      .map((it) => {
        const titles = itemValues(it, locale, "title");
        return {
          type: it.type,
          ...(hasAny(titles) ? { title: text(itemTextKey(kind, it.uid, "title"), titles) } : {}),
          description: text(itemTextKey(kind, it.uid, "description"), descriptionValues(it, locale)),
          keywords: keywordList(it.keywords),
        };
      });

  return {
    id: slug,
    slug,
    name: { default: name, translations: nameTranslations },
    tagline:
      hasAny(taglines) || !placeholders ? field("tagline") : freshText({ [locale]: placeholders.tagline }, undefined, locale),
    short_description: field("short_description"),
    vision: { future_world: field("vision") },
    problem_space: { primary_problem: field("problem") },
    desired_change: field("desired_change"),
    domains: d.domains,
    status: { lifecycle_stage: d.stage, activity_status: d.activity },
    ...(d.scope ? { geography: { scope: d.scope, ...(hasAny(place) ? { place: field("place") } : {}) } } : {}),
    people: {
      stewards: d.steward_name.trim()
        ? [{ name: d.steward_name.trim(), ...(hasAny(role) ? { role: field("steward_role") } : {}) }]
        : [],
    },
    current_needs: items("need", d.needs).map((n, i) => ({ id: `need-${i + 1}`, ...n, status: "open" as const })),
    offers: items("offer", d.offers).map((o, i) => ({ id: `offer-${i + 1}`, ...o })),
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

// --------------------------------------------------------------- edit mode ---

/**
 * The text of one language as the editor shows it: that language's own text, never another language's
 * fallback (an empty English field means "no English yet"). Old texts that only have a `default` show it in
 * the page's language.
 */
function editableText(text: LocalizedText | undefined, lang: Locale, page: Locale): string {
  if (!text) return "";
  const own = text.translations[lang];
  if (own !== undefined) return own.trim();
  const hasTranslations = LOCALES.some((l) => text.translations[l]?.trim());
  return lang === page && !hasTranslations ? (text.default ?? "").trim() : "";
}

/** A Draft filled from an existing project, so the wizard can edit it. Main fields are in `locale`. */
export function draftFromProject(p: Project, locale: Locale = DEFAULT_LOCALE): Draft {
  const steward = p.people.stewards[0];
  const machine: Record<string, MachineMark> = {};
  const remember = (key: string, text: LocalizedText | undefined) => {
    for (const lang of LOCALES) {
      const mark = text?.machine?.[lang];
      if (mark) machine[markKey(lang, key)] = mark;
    }
  };

  const sources: Record<DraftTextField, LocalizedText | undefined> = {
    name: p.name,
    tagline: p.tagline,
    short_description: p.short_description,
    vision: p.vision.future_world,
    problem: p.problem_space.primary_problem,
    desired_change: p.desired_change,
    place: p.geography?.place,
    steward_role: steward?.role,
  };
  for (const f of DRAFT_TEXT_FIELDS) remember(f, sources[f]);
  const textsIn = (lang: Locale) =>
    Object.fromEntries(DRAFT_TEXT_FIELDS.map((f) => [f, editableText(sources[f], lang, locale)])) as DraftTexts;
  const others = LOCALES.filter((l) => l !== locale);

  const item = (kind: "need" | "offer", it: Need | Offer): ItemDraft => {
    const uid = `${kind}-${it.id}`;
    remember(itemTextKey(kind, uid, "title"), it.title);
    remember(itemTextKey(kind, uid, "description"), it.description);
    return {
      uid,
      id: it.id,
      type: it.type,
      title: editableText(it.title, locale, locale),
      description: editableText(it.description, locale, locale),
      keywords: it.keywords.join(", "),
      translations: Object.fromEntries(
        others.map((l) => [l, { title: editableText(it.title, l, locale), description: editableText(it.description, l, locale) }]),
      ),
    };
  };

  return {
    ...textsIn(locale),
    slug: p.slug,
    slugTouched: true,
    needs: p.current_needs.map((n) => ({ ...item("need", n), status: n.status })),
    offers: p.offers.map((o) => item("offer", o)),
    domains: p.domains,
    stage: p.status.lifecycle_stage,
    activity: p.status.activity_status,
    scope: p.geography?.scope ?? "",
    collab: p.collaboration_preferences.types,
    website: p.links.website ?? "",
    linkedin: p.links.linkedin ?? "",
    github: p.links.github ?? "",
    steward_name: steward?.name ?? "",
    translations: Object.fromEntries(others.map((l) => [l, textsIn(l)])),
    machine,
  };
}

/**
 * Apply the draft's text, in every language it holds, to a stored localized value. Each language is
 * compared with what the editor was shown for it: an unchanged language keeps its stored text, a changed
 * one is set (or removed when emptied). An unchanged value is returned as is.
 * `default` follows an edit of the default language only when it is what the editor was looking at — an
 * edit in another language never overwrites it.
 */
function mergeLocalized(
  original: LocalizedText | undefined,
  values: LocaleValues,
  machine: LocalizedText["machine"],
  page: Locale,
): LocalizedText {
  if (!original) return freshText(values, machine, page);
  const translations = { ...original.translations };
  let fallback = original.default;
  let changed = false;
  for (const lang of LOCALES) {
    const next = values[lang];
    if (next === undefined) continue;
    const value = next.trim();
    const shown = editableText(original, lang, page);
    if (value === shown) continue;
    changed = true;
    if (value) translations[lang] = value;
    else delete translations[lang];
    if (lang === DEFAULT_LOCALE && value && original.default?.trim() === shown) fallback = value;
  }
  if (!changed && sameMarks(original.machine, machine)) return original;
  return {
    ...(fallback !== undefined ? { default: fallback } : {}),
    translations,
    ...(machine ? { machine } : {}),
  };
}

/**
 * The project as it should be after the wizard's edits. Identity (id, slug) and moderation state
 * (`portal`) always come from the ORIGINAL — a steward cannot change them through a draft.
 * Existing needs/offers keep their id; new ones get a temporary `new-N` id.
 */
export function applyDraft(original: Project, d: Draft, locale: Locale = DEFAULT_LOCALE): Project {
  const needById = new Map(original.current_needs.map((n) => [n.id, n]));
  const offerById = new Map(original.offers.map((o) => [o.id, o]));
  const merge = (before: LocalizedText | undefined, key: string, values: LocaleValues) =>
    mergeLocalized(before, values, marksFor(d, key, values), locale);
  /** For optional fields: no text in any language means "no value". */
  const mergeOptional = (before: LocalizedText | undefined, key: string, values: LocaleValues) =>
    hasAny(values) ? merge(before, key, values) : undefined;
  const field = (before: LocalizedText, f: DraftTextField) => merge(before, f, fieldValues(d, locale, f));

  const place = mergeOptional(original.geography?.place, "place", fieldValues(d, locale, "place"));

  const stewards = (): Steward[] => {
    const name = d.steward_name.trim();
    if (!name) return original.people.stewards;
    const { role: oldRole, ...rest } = original.people.stewards[0] ?? { name };
    const role = mergeOptional(oldRole, "steward_role", fieldValues(d, locale, "steward_role"));
    return [{ ...rest, name, ...(role ? { role } : {}) }, ...original.people.stewards.slice(1)];
  };

  /** The texts of a need/offer; existing items keep their id. */
  const itemTexts = (kind: "need" | "offer", it: ItemDraft, before: Need | Offer | undefined) => {
    const title = mergeOptional(before?.title, itemTextKey(kind, it.uid, "title"), itemValues(it, locale, "title"));
    return {
      ...(title ? { title } : {}),
      description: merge(before?.description, itemTextKey(kind, it.uid, "description"), descriptionValues(it, locale)),
    };
  };
  const filled = (it: ItemDraft) =>
    hasAny(itemValues(it, locale, "title")) || hasAny(itemValues(it, locale, "description"));

  return {
    ...original,
    name: field(original.name, "name"),
    tagline: field(original.tagline, "tagline"),
    short_description: field(original.short_description, "short_description"),
    vision: { future_world: field(original.vision.future_world, "vision") },
    problem_space: { primary_problem: field(original.problem_space.primary_problem, "problem") },
    desired_change: field(original.desired_change, "desired_change"),
    domains: d.domains,
    status: { lifecycle_stage: d.stage, activity_status: d.activity },
    geography: d.scope ? { scope: d.scope, ...(place ? { place } : {}) } : undefined,
    people: { stewards: stewards() },
    current_needs: d.needs.filter(filled).map((n, i): Need => {
      const before = n.id ? needById.get(n.id) : undefined;
      return {
        id: before?.id ?? `new-${i + 1}`,
        type: n.type,
        ...itemTexts("need", n, before),
        keywords: keywordList(n.keywords),
        status: n.status ?? before?.status ?? "open",
      };
    }),
    offers: d.offers.filter(filled).map((o, i): Offer => {
      const before = o.id ? offerById.get(o.id) : undefined;
      return {
        id: before?.id ?? `new-${i + 1}`,
        type: o.type,
        ...itemTexts("offer", o, before),
        keywords: keywordList(o.keywords),
      };
    }),
    collaboration_preferences: { types: d.collab },
    links: { website: urlOrNull(d.website), linkedin: urlOrNull(d.linkedin), github: urlOrNull(d.github) },
  };
}

const keyPattern = /^[a-z][a-z0-9_]*$/;
const localeSchema = z.enum(LOCALES);

const itemTextsSchema = z.object({ title: z.string().max(200), description: z.string().max(1500) });

const itemDraftSchema = z.object({
  uid: z.string().max(120),
  id: z.string().min(1).max(64).optional(),
  type: z.string().regex(keyPattern),
  title: itemTextsSchema.shape.title,
  description: itemTextsSchema.shape.description,
  keywords: z.string().max(400),
  status: needStatusSchema.optional(),
  translations: z.partialRecord(localeSchema, itemTextsSchema).optional(),
});

/** The limits of the text fields — the same in every language. */
const draftTextsSchema = z.object({
  name: z.string().max(200),
  tagline: z.string().max(300),
  short_description: z.string().max(3000),
  vision: z.string().max(6000),
  problem: z.string().max(6000),
  desired_change: z.string().max(6000),
  place: z.string().max(200),
  steward_role: z.string().max(120),
});

/** Server-side validation of a draft sent from the browser. Never trust the client's shape. */
export const draftSchema: z.ZodType<Draft> = draftTextsSchema.extend({
  slug: z.string().max(80),
  slugTouched: z.boolean(),
  needs: z.array(itemDraftSchema).max(20),
  offers: z.array(itemDraftSchema).max(20),
  domains: z.array(z.string().regex(keyPattern)).max(12),
  stage: lifecycleStageSchema,
  activity: activityStatusSchema,
  scope: z.union([geographyScopeSchema, z.literal("")]),
  collab: z.array(z.string().regex(keyPattern)).max(12),
  website: z.string().max(300),
  linkedin: z.string().max(300),
  github: z.string().max(300),
  steward_name: z.string().max(120),
  // Drafts saved in a browser before bilingual editing existed have neither of these.
  translations: z.partialRecord(localeSchema, draftTextsSchema).default({}),
  machine: z
    .record(z.string().max(200), machineMarkSchema)
    .refine((marks) => Object.keys(marks).length <= 400, "too many translation marks")
    .default({}),
});

export type StepId = "identity" | "intent" | "needs" | "offers" | "details" | "translation" | "review";

/** The wizard's steps, in order. Their labels are in the dictionaries (wizard.steps). */
export const STEP_IDS: StepId[] = ["identity", "intent", "needs", "offers", "details", "translation", "review"];

/** The wizard's validation messages (Messages["wizard"]["errors"]), in the visitor's language. */
export type WizardErrors = Messages["wizard"]["errors"];

/** Minimal, kind validation per step. Returns messages keyed by field. */
export function validateStep(step: StepId, d: Draft, messages: WizardErrors): Record<string, string> {
  const errors: Record<string, string> = {};
  // A required text may be written in any language: editing on /en a project that only has Hebrew text
  // leaves the English fields empty until someone writes or translates them.
  const missing = (f: DraftTextField) =>
    !d[f].trim() && !Object.values(d.translations).some((texts) => texts?.[f]?.trim());
  if (step === "identity") {
    if (missing("name")) errors.name = messages.name;
    if (missing("tagline")) errors.tagline = messages.tagline;
    if (missing("short_description")) errors.short_description = messages.shortDescription;
    const slug = d.slug || slugify(d.name);
    if (!SLUG_PATTERN.test(slug)) errors.slug = messages.slug;
    else if (slug === RESERVED_SLUG) errors.slug = messages.slugReserved;
  }
  if (step === "intent") {
    if (missing("vision")) errors.vision = messages.vision;
    if (missing("problem")) errors.problem = messages.problem;
    if (missing("desired_change")) errors.desired_change = messages.desiredChange;
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
