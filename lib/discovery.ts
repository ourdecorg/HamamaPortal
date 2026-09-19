import { z } from "zod";
import { allVariants, shortLabel, t, withPrefix } from "@/lib/locale";
import { scoreProject, SEARCH_FIELD_LABELS } from "@/lib/search";
import { GEOGRAPHY_SCOPES, domainLabel, exchangeType } from "@/lib/taxonomy";
import { stemsWithWords } from "@/lib/text";
import { detectIntent, detectTopics, type Intent } from "@/lib/topics";
import type { GeographyScope, Project } from "@/types/project";

/**
 * Conversational discovery: "tell us what you want to happen" → relevant
 * projects, with reasons.
 *
 * Today this is a transparent heuristic (topics lexicon + keyword scoring).
 * The shape of `DiscoveryInput` / `DiscoveryResult` is the contract an LLM can
 * satisfy later: swap the provider, keep every caller. The app never needs an
 * API key — the heuristic provider is always available and is also the
 * fallback if an LLM provider fails.
 *
 * Principle: AI/search may suggest, humans decide. A provider only ranks and
 * explains projects that already exist in the data; it never invents them.
 */

// ------------------------------------------------------------------ types ---

export interface DiscoveryContext {
  /** Optional structured hints from the wish form. */
  domain?: string | null;
  scope?: GeographyScope | null;
  /** "What can I offer?" */
  offer?: string;
  /** "Desired outcome" */
  outcome?: string;
}

export interface DiscoveryInput {
  query: string;
  projects: Project[];
  context?: DiscoveryContext;
}

export interface Interpretation {
  /** One friendly sentence: "הבנו שאתם מחפשים…". */
  summary: string;
  intent: Intent;
  topics: { id: string; label: string }[];
  domains: string[];
  /** The user's own meaningful words (shown as chips). */
  keywords: string[];
  has_offer: boolean;
}

export type DiscoveryReasonKind = "need" | "offer" | "words" | "topic" | "domain" | "scope";

export interface DiscoveryReason {
  kind: DiscoveryReasonKind;
  text: string;
}

export interface DiscoveryMatch {
  project: Project;
  /** For ordering only. Never displayed as a number. */
  score: number;
}

export interface SuggestedAction {
  label: string;
  href: string;
  hint?: string;
}

export interface DiscoveryResult {
  engine: "heuristic" | "llm";
  interpretation: Interpretation;
  matches: DiscoveryMatch[];
  /** Why each match was suggested, keyed by project id. */
  reasons: Record<string, DiscoveryReason[]>;
  suggested_actions: SuggestedAction[];
}

export interface DiscoveryProvider {
  id: DiscoveryResult["engine"];
  discover(input: DiscoveryInput): Promise<DiscoveryResult>;
}

// -------------------------------------------------------------- heuristic ---

const MAX_MATCHES = 5;
const MIN_SCORE = 3;

const GENERIC = new Set(["community", "pilot", "group", "groups", "volunteers", "teams", "network", "local", "learning"]);

function needTexts(n: Project["current_needs"][number]): string {
  return [...allVariants(n.title), ...allVariants(n.description), ...n.keywords].join(" ");
}
function offerTexts(o: Project["offers"][number]): string {
  return [...allVariants(o.title), ...allVariants(o.description), ...o.keywords].join(" ");
}

function sharedWords(userText: string, otherText: string): string[] {
  const mine = stemsWithWords(userText);
  const theirs = stemsWithWords(otherText);
  const hits: string[] = [];
  for (const [s, word] of mine) {
    if (s.length < 3 || GENERIC.has(word)) continue;
    if (theirs.has(s)) hits.push(word);
  }
  return hits;
}

function quoteList(words: string[], max = 3): string {
  return words.slice(0, max).map((w) => `«${w}»`).join(", ");
}

function scoreOne(
  project: Project,
  ctx: {
    wishText: string;
    offerText: string;
    topics: ReturnType<typeof detectTopics>;
    offerTopics: ReturnType<typeof detectTopics>;
    intent: Intent;
    context: DiscoveryContext;
  },
): { score: number; reasons: (DiscoveryReason & { weight: number })[] } {
  const reasons: (DiscoveryReason & { weight: number })[] = [];
  let score = 0;

  // 1) Their own words appearing in the project.
  const text = scoreProject(project, ctx.wishText);
  // Someone offering cares more about what a project *needs* than what it says.
  score += ctx.offerText.trim() ? text.score * 0.5 : text.score;
  if (text.matched_terms.length) {
    const where = text.matched_fields.slice(0, 2).map((f) => SEARCH_FIELD_LABELS[f]).join(" ו");
    reasons.push({
      kind: "words",
      weight: 3 + Math.min(text.matched_terms.length, 3),
      text: `${quoteList(text.matched_terms)} מופיעות ${where} של המיזם.`,
    });
  }

  // 2) Topics → the project's domains.
  for (const { topic } of ctx.topics) {
    const shared = topic.domains.filter((d) => project.domains.includes(d));
    if (shared.length) {
      score += 3;
      reasons.push({
        kind: "topic",
        weight: 3,
        text: `המיזם עוסק ${withPrefix("ב", domainLabel(shared[0]))} — קרוב למה שכתבתם על ${topic.label}.`,
      });
    }
  }

  // 3) A domain chosen explicitly in the form.
  if (ctx.context.domain && project.domains.includes(ctx.context.domain)) {
    score += 4;
    reasons.push({ kind: "domain", weight: 4, text: `המיזם פועל בתחום ${domainLabel(ctx.context.domain)}, שבחרתם.` });
  }

  // 4) Someone seeking: does the project OFFER something that fits?
  let bestOffer: { score: number; text: string } | null = null;
  for (const offer of project.offers) {
    const words = sharedWords(ctx.wishText, offerTexts(offer));
    const typeHit = ctx.topics.some(({ topic }) => topic.types.includes(offer.type));
    const s = words.length * 2 + (typeHit ? 2 : 0);
    if (s > 0 && (!bestOffer || s > bestOffer.score)) {
      const why = words.length ? ` (${quoteList(words, 2)})` : ` (${exchangeType(offer.type).he})`;
      bestOffer = { score: s, text: `המיזם מציע «${shortLabel(offer)}»${why} — זה יכול לענות על מה שאתם מחפשים.` };
    }
  }
  if (bestOffer && ctx.intent !== "offering") {
    score += bestOffer.score;
    reasons.push({ kind: "offer", weight: 4 + bestOffer.score, text: bestOffer.text });
  }

  // 5) Someone offering: does the project NEED something they can give?
  if (ctx.offerText.trim()) {
    let bestNeed: { score: number; text: string } | null = null;
    for (const need of project.current_needs) {
      if (need.status !== "open") continue;
      const words = sharedWords(ctx.offerText, needTexts(need));
      const typeHit = ctx.offerTopics.some(({ topic }) => topic.types.includes(need.type));
      const s = words.length * 2 + (typeHit ? 3 : 0);
      if (s > 0 && (!bestNeed || s > bestNeed.score)) {
        bestNeed = {
          score: s,
          text: `המיזם מחפש «${shortLabel(need)}» — זה מתחבר למה שיש לכם להציע.`,
        };
      }
    }
    if (bestNeed) {
      score += bestNeed.score * 2 + 6;
      reasons.push({ kind: "need", weight: 6 + bestNeed.score, text: bestNeed.text });
    }
  }

  // 6) Scope preference.
  const scope = ctx.context.scope;
  if (scope && project.geography?.scope === scope) {
    score += 1;
    reasons.push({
      kind: "scope",
      weight: 1,
      text: `המיזם פועל ברמה ${GEOGRAPHY_SCOPES[scope].he}, כמו שציינתם.`,
    });
  }

  return { score, reasons };
}

function buildInterpretation(
  query: string,
  context: DiscoveryContext,
  topics: ReturnType<typeof detectTopics>,
  intent: Intent,
): Interpretation {
  const labels = topics.slice(0, 4).map((x) => x.topic.label);
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} ו${labels[labels.length - 1]}` : labels[0];
  const hasOffer = Boolean(context.offer?.trim());

  let summary: string;
  if (!labels.length) {
    summary = "לא זיהינו נושא מוכר במשאלה — נחפש לפי המילים שכתבתם.";
  } else if (intent === "offering") {
    summary = `הבנו שאתם רוצים לתרום, ושהנושאים שקרובים אליכם הם ${list}.`;
  } else if (intent === "creating") {
    summary = `הבנו שאתם רוצים ליצור משהו סביב ${list}.`;
  } else if (intent === "seeking") {
    summary = `הבנו שאתם מחפשים מיזמים שעוסקים ב${list}.`;
  } else {
    summary = `הבנו שמעניינים אתכם הנושאים ${list}.`;
  }
  if (hasOffer && intent !== "offering") summary += " וגם שיש לכם משהו להציע.";

  const domains = [
    ...new Set([...(context.domain ? [context.domain] : []), ...topics.flatMap((x) => x.topic.domains)]),
  ];
  const keywords = [...stemsWithWords(query).values()].slice(0, 8);

  return {
    summary,
    intent,
    topics: topics.map((x) => ({ id: x.topic.id, label: x.topic.label })),
    domains,
    keywords,
    has_offer: hasOffer,
  };
}

function buildActions(query: string, intent: Intent, matches: DiscoveryMatch[], hasOffer: boolean): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  const top = matches[0]?.project;

  if (top) {
    actions.push({
      label: `להכיר את ${t(top.name)}`,
      href: `/projects/${top.slug}`,
      hint: "קראו את הסיפור המלא, מה הם צריכים ומה הם מציעים.",
    });
  }
  if (intent === "offering" || hasOffer) {
    actions.push({
      label: "לעיין בצרכים הפתוחים",
      href: "/projects?exchange=needs",
      hint: "כל המיזמים שמחפשים משהו עכשיו.",
    });
  }
  if (matches.length > 1) {
    actions.push({
      label: "לראות חיבורים בין המיזמים",
      href: "/connections",
      hint: "אולי מה שחיפשתם קורה בין שני מיזמים.",
    });
  }
  if (intent === "creating" || matches.length < 2) {
    actions.push({
      label: "להוסיף מיזם משלכם",
      href: "/projects/new",
      hint: "אם זה עוד לא קיים — אולי הגיע הזמן שיתחיל.",
    });
  }
  if (query.trim()) {
    actions.push({
      label: "לחפש בפירוט בין כל המיזמים",
      href: `/projects?q=${encodeURIComponent(query.trim())}`,
    });
  }
  return actions.slice(0, 4);
}

export const heuristicProvider: DiscoveryProvider = {
  id: "heuristic",
  async discover({ query, projects, context = {} }) {
    const wishText = [query, context.outcome].filter(Boolean).join(" ");
    const intent = detectIntent(query);
    // When someone says "I want to contribute…", the query itself is the offer.
    const offerText = [context.offer, intent === "offering" ? query : ""].filter(Boolean).join(" ");

    const topics = detectTopics(wishText);
    const offerTopics = detectTopics(offerText);

    const scored = projects
      .map((project) => ({
        project,
        ...scoreOne(project, { wishText, offerText, topics, offerTopics, intent, context }),
      }))
      .filter((x) => x.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MATCHES);

    const matches: DiscoveryMatch[] = scored.map((x) => ({ project: x.project, score: x.score }));
    const reasons: DiscoveryResult["reasons"] = {};
    for (const x of scored) {
      reasons[x.project.id] = x.reasons
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3)
        .map(({ kind, text }) => ({ kind, text }));
    }

    const interpretation = buildInterpretation(query, context, topics, intent);
    return {
      engine: "heuristic",
      interpretation,
      matches,
      reasons,
      suggested_actions: buildActions(query, intent, matches, interpretation.has_offer),
    };
  },
};

// -------------------------------------------------- LLM seam (not required) ---

/**
 * The integration point for a language model. Implement `complete` with any
 * client (e.g. the Anthropic SDK, server-side only) and wrap it with
 * `createLlmProvider`. The app does not call this unless you wire it in.
 */
export interface LlmClient {
  complete(input: { system: string; user: string }): Promise<string>;
}

const llmResponseSchema = z.object({
  summary: z.string(),
  topics: z.array(z.string()).default([]),
  matches: z
    .array(z.object({ slug: z.string(), reasons: z.array(z.string()).min(1).max(3) }))
    .max(MAX_MATCHES),
});

export function createLlmProvider(client: LlmClient, fallback: DiscoveryProvider = heuristicProvider): DiscoveryProvider {
  return {
    id: "llm",
    async discover(input) {
      // The model sees a compact digest of real projects and must answer in JSON.
      const digest = input.projects.map((p) => ({
        slug: p.slug,
        name: t(p.name),
        change: t(p.desired_change),
        domains: p.domains,
        needs: p.current_needs.map((n) => shortLabel(n)),
        offers: p.offers.map((o) => shortLabel(o)),
      }));
      const raw = await client.complete({
        system:
          "You match a person's wish to existing initiatives. Only use slugs from the list. " +
          "Explain each match in one Hebrew sentence. Reply with JSON: {summary, topics, matches:[{slug, reasons}]}.",
        user: JSON.stringify({ wish: input.query, context: input.context ?? {}, projects: digest }),
      });

      const parsed = llmResponseSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return fallback.discover(input);

      const bySlug = new Map(input.projects.map((p) => [p.slug, p]));
      const matches: DiscoveryMatch[] = [];
      const reasons: DiscoveryResult["reasons"] = {};
      parsed.data.matches.forEach((m, i) => {
        const project = bySlug.get(m.slug);
        if (!project) return; // never invent projects
        matches.push({ project, score: MAX_MATCHES - i });
        reasons[project.id] = m.reasons.map((text) => ({ kind: "topic" as const, text }));
      });

      const base = await fallback.discover(input);
      return {
        ...base,
        engine: "llm",
        interpretation: { ...base.interpretation, summary: parsed.data.summary },
        matches,
        reasons,
      };
    },
  };
}

// ---------------------------------------------------------------- entry -----

/**
 * Which provider is active. Today: always the heuristic one, so the app runs
 * with no configuration. To enable a model, return
 * `createLlmProvider(myClient)` when `process.env.ANTHROPIC_API_KEY` is set.
 */
export function getDiscoveryProvider(): DiscoveryProvider {
  return heuristicProvider;
}

/** Discover with the active provider; never throws — falls back to the heuristic. */
export async function discover(input: DiscoveryInput): Promise<DiscoveryResult> {
  const provider = getDiscoveryProvider();
  try {
    return await provider.discover(input);
  } catch {
    return heuristicProvider.discover(input);
  }
}
