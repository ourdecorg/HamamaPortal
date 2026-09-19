import { allVariants, shortLabel, t, withPrefix } from "@/lib/locale";
import {
  NEXT_STEPS,
  NEXT_STEPS_BY_NEED_TYPE,
  LIFECYCLE_STAGES,
  collabLabel,
  domainLabel,
  exchangeType,
  typeCompatibility,
  type NextStepId,
} from "@/lib/taxonomy";
import { normalize, stem, stemsWithWords } from "@/lib/text";
import type { Need, Offer, Project } from "@/types/project";

/**
 * The connection engine (MVP).
 *
 * Deterministic and readable on purpose — no embeddings, no model:
 *
 *   for every open NEED of project A and every OFFER of project B:
 *     + need type ↔ offer type      (same type, or a related type)
 *     + shared keywords             (explicit keyword tags + words in the texts)
 *     + shared domains
 *     + compatible collaboration preferences
 *   the best pair for A→B becomes a candidate; if B→A also works the
 *   connection is marked reciprocal.
 *
 * The explanation (`reasons`, `unknowns`, `summary`) matters more than the
 * number. `confidence` is only a UI hint and is never shown as a bare score.
 *
 * To replace this later (embeddings, an LLM, human curation) keep the
 * `Connection` shape and swap `findConnections`.
 */

export type ReasonKind =
  | "need_offer"
  | "keywords"
  | "shared_domain"
  | "collaboration"
  | "reciprocal";

export interface Reason {
  kind: ReasonKind;
  text: string;
  /** Shared keyword tags, shown as chips (kept out of the Hebrew sentence). */
  tags?: string[];
}

export interface ProjectRef {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  domains: string[];
  stewards: string[];
  is_demo: boolean;
}

export interface NextStep {
  id: NextStepId;
  label: string;
  hint: string;
}

export interface Connection {
  /** Stable id, safe to use as an URL fragment. */
  id: string;
  /** The project that has the NEED. */
  project_a: ProjectRef;
  /** The project that has the OFFER. */
  project_b: ProjectRef;
  need: { id: string; type: string; label: string; description: string };
  offer: { id: string; type: string; label: string; description: string };
  /** One human sentence: why this connection is suggested. */
  summary: string;
  reasons: Reason[];
  /** What the data cannot tell us — to be asked by people, not guessed. */
  unknowns: string[];
  /** 0..1, a UI hint only. */
  confidence: number;
  /** When B also needs something A offers, the reverse direction. */
  reciprocal: {
    need: { id: string; type: string; label: string };
    offer: { id: string; type: string; label: string };
  } | null;
  next_steps: NextStep[];
}

// ------------------------------------------------------------------ utils ---

export function toRef(p: Project): ProjectRef {
  return {
    id: p.id,
    slug: p.slug,
    name: t(p.name),
    tagline: t(p.tagline),
    domains: p.domains,
    stewards: p.people.stewards.map((s) => s.name),
    is_demo: p.portal.is_demo,
  };
}

function textStems(...texts: (string | undefined)[]): Map<string, string> {
  return stemsWithWords(texts.filter(Boolean).join(" "));
}

function needText(n: Need): string[] {
  return [...allVariants(n.title), ...allVariants(n.description), ...n.keywords];
}
function offerText(o: Offer): string[] {
  return [...allVariants(o.title), ...allVariants(o.description), ...o.keywords];
}

/**
 * Words too generic to count as a topical link between a need and an offer.
 * ("community" appears everywhere; sharing it says nothing about *what* for.)
 */
const GENERIC_KEYWORDS = new Set([
  "community", "pilot", "group", "groups", "volunteers", "teams", "network", "local",
  "participants", "project", "projects", "initiatives", "professionals", "learning", "households",
]);

/** Stems of Hebrew/English words in free text that are too generic to count. */
const GENERIC_STEMS = new Set([
  "מיזמ", "אנש", "קבוצ", "עוד", "פרוייקט", "project", "people", "group", "team", "work", "help",
  "קהיל", "פיילוט", "מתנדב", "מפגש", "שנ", "חודש",
]);

/** Stem-normalise explicit tags so "Sharing" and "share" (or two Hebrew tags) meet. */
function tagMap(tags: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of tags) {
    if (GENERIC_KEYWORDS.has(tag.toLowerCase())) continue;
    const key = stem(normalize(tag));
    if (key.length >= 2 && !map.has(key)) map.set(key, tag);
  }
  return map;
}

/**
 * The topical link between a need and an offer.
 *
 * When both sides carry explicit keyword tags we trust only those: they are
 * deliberate and precise. Otherwise we fall back to words the two texts share,
 * which is noisier, so it must clear a higher bar (2+ meaningful words).
 */
function sharedKeywords(need: Need, offer: Offer): string[] {
  if (need.keywords.length && offer.keywords.length) {
    const a = tagMap(need.keywords);
    const b = tagMap(offer.keywords);
    return [...a].filter(([k]) => b.has(k)).map(([, tag]) => tag);
  }

  const a = textStems(...needText(need));
  const b = textStems(...offerText(offer));
  const implicit: string[] = [];
  for (const [s, word] of a) {
    if (GENERIC_STEMS.has(s) || s.length < 4) continue;
    if (b.has(s)) implicit.push(word);
  }
  return implicit.length >= 2 ? implicit : [];
}

function overlap<T>(a: T[], b: T[]): T[] {
  return a.filter((x) => b.includes(x));
}

// ---------------------------------------------------------------- scoring ---

/** Below this a pair is not worth showing. */
const MIN_SCORE = 0.46;

interface PairScore {
  need: Need;
  offer: Offer;
  score: number;
  compat: "exact" | "related" | "none";
  keywords: string[];
}

/** Every (need of a, offer of b) pair that is worth suggesting, with its score. */
function qualifyingPairs(a: Project, b: Project): PairScore[] {
  const domainOverlap = overlap(a.domains, b.domains).length;
  const collabOverlap = overlap(
    a.collaboration_preferences.types,
    b.collaboration_preferences.types,
  ).length;

  const pairs: PairScore[] = [];

  for (const need of a.current_needs) {
    if (need.status !== "open") continue;
    for (const offer of b.offers) {
      const compat = typeCompatibility(need.type, offer.type);
      const keywords = sharedKeywords(need, offer);

      // Gate: what is needed and what is offered must be linked by *topic*,
      // not just by category. A same-type pair with nothing else in common
      // ("someone needs a community" / "someone has a community") is noise,
      // and a domain match alone is not a connection either.
      if (compat === "none" ? keywords.length < 2 : keywords.length < 1) continue;

      let score = 0;
      score += compat === "exact" ? 0.32 : compat === "related" ? 0.2 : 0;
      score += Math.min(keywords.length, 3) * 0.14;
      score += domainOverlap >= 2 ? 0.12 : domainOverlap === 1 ? 0.08 : 0;
      score += Math.min(collabOverlap, 2) * 0.03;

      if (score >= MIN_SCORE) pairs.push({ need, offer, score, compat, keywords });
    }
  }
  return pairs;
}

/** The strongest qualifying pair from a's needs to b's offers, if any. */
function bestPair(a: Project, b: Project): PairScore | null {
  return qualifyingPairs(a, b).reduce<PairScore | null>((best, p) => (!best || p.score > best.score ? p : best), null);
}

// ------------------------------------------------------------- explanation --

function buildUnknowns(a: Project, b: Project, pair: PairScore): string[] {
  const unknowns: string[] = [];

  const ga = a.geography;
  const gb = b.geography;
  if (!ga || !gb) {
    unknowns.push("התאמה גיאוגרפית");
  } else if (ga.scope !== gb.scope) {
    unknowns.push("התאמה גיאוגרפית — היקפי הפעילות שונים");
  } else if (ga.scope === "local" && t(ga.place) !== t(gb.place)) {
    unknowns.push(`המרחק בין ${t(ga.place) || "המקום של " + t(a.name)} ${withPrefix("ל", t(gb.place) || "המקום של " + t(b.name))}`);
  }

  unknowns.push("זמינות ולוחות זמנים");

  if (pair.compat === "related") {
    unknowns.push("האם ההצעה באמת עונה על הצורך — הסוגים קרובים, לא זהים");
  } else {
    unknowns.push("היקף — כמה מהצורך ההצעה מכסה בפועל");
  }

  const stageGap = Math.abs(
    LIFECYCLE_STAGES[a.status.lifecycle_stage].order - LIFECYCLE_STAGES[b.status.lifecycle_stage].order,
  );
  if (stageGap >= 3) unknowns.push("התאמת שלב — המיזמים נמצאים בשלבים שונים מאוד");

  if (overlap(a.collaboration_preferences.types, b.collaboration_preferences.types).length === 0) {
    unknowns.push("סגנון שיתוף פעולה מועדף");
  }
  return unknowns.slice(0, 4);
}

function buildReasons(
  a: Project,
  b: Project,
  pair: PairScore,
  reciprocal: boolean,
): Reason[] {
  const reasons: Reason[] = [];
  const needType = exchangeType(pair.need.type).he;
  const offerType = exchangeType(pair.offer.type).he;

  if (pair.compat === "exact") {
    reasons.push({
      kind: "need_offer",
      text: `${t(a.name)} מחפש ${needType}, ${withPrefix("ו", t(b.name))} מציע ${offerType} — התאמה ישירה בין הצורך להצעה.`,
    });
  } else if (pair.compat === "related") {
    reasons.push({
      kind: "need_offer",
      text: `הצורך של ${t(a.name)} (${needType}) והצעה של ${t(b.name)} (${offerType}) הם סוגים קרובים — ייתכן שהם משלימים זה את זה.`,
    });
  }

  if (pair.keywords.length) {
    reasons.push({
      kind: "keywords",
      text: "הצורך וההצעה מתארים נושאים משותפים:",
      tags: pair.keywords.slice(0, 4),
    });
  }

  const domains = overlap(a.domains, b.domains);
  if (domains.length) {
    reasons.push({
      kind: "shared_domain",
      text: `תחום משותף: ${domains.map((d) => domainLabel(d)).join(", ")}.`,
    });
  }

  const collab = overlap(a.collaboration_preferences.types, b.collaboration_preferences.types);
  if (collab.length) {
    reasons.push({
      kind: "collaboration",
      text: `שניהם פתוחים ל${collab.slice(0, 2).map(collabLabel).join(" ול")}.`,
    });
  }

  if (reciprocal) {
    reasons.push({
      kind: "reciprocal",
      text: `החיבור הדדי: גם ${withPrefix("ל", t(b.name))} יש צורך ש${t(a.name)} יכול לענות עליו.`,
    });
  }
  return reasons;
}

function buildSummary(a: Project, b: Project, need: Need, offer: Offer): string {
  return `החיבור מוצע משום ש${t(a.name)} מחפש ${shortLabel(need)}, ${withPrefix("ו", t(b.name))} מציע ${shortLabel(offer)}.`;
}

function buildNextSteps(need: Need, reciprocal: boolean): NextStep[] {
  const ids: NextStepId[] = ["intro_call", ...(NEXT_STEPS_BY_NEED_TYPE[need.type] ?? ["joint_experiment"])];
  if (reciprocal && !ids.includes("knowledge_swap")) ids.push("knowledge_swap");
  return [...new Set(ids)].slice(0, 3).map((id) => ({ id, label: NEXT_STEPS[id].he, hint: NEXT_STEPS[id].hint }));
}

function describe(need: Need | Offer) {
  return {
    id: need.id,
    type: need.type,
    label: shortLabel(need),
    description: t(need.description),
  };
}

// ---------------------------------------------------------------- engine ----

/**
 * Find possible connections across a set of projects.
 * At most one connection per pair of projects; strongest first.
 */
export function findConnections(projects: Project[]): Connection[] {
  const byPair = new Map<string, Connection>();

  for (const a of projects) {
    for (const b of projects) {
      if (a.id === b.id) continue;
      const forward = bestPair(a, b);
      if (!forward) continue;

      const back = bestPair(b, a);
      const pairKey = [a.id, b.id].sort().join("::");
      const existing = byPair.get(pairKey);

      const reciprocal = Boolean(back);
      let confidence = Math.min(0.95, forward.score + (reciprocal ? 0.05 : 0));
      // Slightly prefer connections whose both sides are actually active.
      if (a.status.activity_status !== "active" || b.status.activity_status !== "active") {
        confidence -= 0.05;
      }
      confidence = Math.max(0.1, Math.round(confidence * 100) / 100);

      if (existing && existing.confidence >= confidence) continue;

      byPair.set(pairKey, {
        id: `${a.slug}--${b.slug}`,
        project_a: toRef(a),
        project_b: toRef(b),
        need: describe(forward.need),
        offer: describe(forward.offer),
        summary: buildSummary(a, b, forward.need, forward.offer),
        reasons: buildReasons(a, b, forward, reciprocal),
        unknowns: buildUnknowns(a, b, forward),
        confidence,
        reciprocal: back
          ? {
              need: { id: back.need.id, type: back.need.type, label: shortLabel(back.need) },
              offer: { id: back.offer.id, type: back.offer.type, label: shortLabel(back.offer) },
            }
          : null,
        next_steps: buildNextSteps(forward.need, reciprocal),
      });
    }
  }
  return [...byPair.values()].sort((x, y) => y.confidence - x.confidence || x.id.localeCompare(y.id));
}

/** Connections that involve one project (either side). */
export function connectionsFor(connections: Connection[], projectId: string): Connection[] {
  return connections.filter((c) => c.project_a.id === projectId || c.project_b.id === projectId);
}

/**
 * Pick `count` connections for a showcase, preferring variety:
 * no project appears twice until we have to.
 */
export function pickDiverse(connections: Connection[], count: number): Connection[] {
  const picked: Connection[] = [];
  const used = new Set<string>();
  for (const c of connections) {
    if (picked.length >= count) break;
    if (used.has(c.project_a.id) || used.has(c.project_b.id)) continue;
    picked.push(c);
    used.add(c.project_a.id);
    used.add(c.project_b.id);
  }
  for (const c of connections) {
    if (picked.length >= count) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}

/** A qualitative reading of the confidence hint — never show the raw number. */
export function signalStrength(confidence: number): { level: 1 | 2 | 3; label: string } {
  if (confidence >= 0.74) return { level: 3, label: "אות חזק" };
  if (confidence >= 0.6) return { level: 2, label: "אות סביר" };
  return { level: 1, label: "אות ראשוני" };
}

export interface UnmetNeed {
  project: ProjectRef;
  need: { id: string; type: string; label: string; description: string };
}

/**
 * Open needs that no offer in the ecosystem answers yet. These are not
 * failures — they are the most useful signal for who to invite next.
 */
export function findUnmetNeeds(projects: Project[]): UnmetNeed[] {
  const unmet: UnmetNeed[] = [];
  for (const a of projects) {
    const answered = new Set<string>();
    for (const b of projects) {
      if (a.id === b.id) continue;
      for (const pair of qualifyingPairs(a, b)) answered.add(pair.need.id);
    }
    for (const need of a.current_needs) {
      if (need.status === "open" && !answered.has(need.id)) unmet.push({ project: toRef(a), need: describe(need) });
    }
  }
  return unmet;
}
