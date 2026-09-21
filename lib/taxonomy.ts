import type { ActivityStatus, GeographyScope, LifecycleStage } from "@/types/project";

/**
 * Human-facing vocabulary. Pure data (no React) so it can be used from
 * server code, client code and the matching engine alike.
 */

import type { Locale } from "@/lib/i18n/config";

export interface Label {
  he: string;
  en: string;
}

/** The text of a bilingual label in the given locale. */
export function pick(label: Label, locale: Locale): string {
  return label[locale];
}

// ---------------------------------------------------------------- domains ---

export interface DomainInfo extends Label {
  /** A muted hue (0-360) used for the small dot on domain tags. */
  hue: number;
  /** One friendly line shown on the domain cloud. */
  blurb: Label;
}

export const DOMAINS: Record<string, DomainInfo> = {
  communities: { he: "קהילות", en: "Communities", hue: 152, blurb: { he: "לחיות ולעשות יחד", en: "Living and doing together" } },
  ai_humans: { he: "AI ואנשים", en: "AI & People", hue: 262, blurb: { he: "טכנולוגיה שמשרתת שיקול דעת אנושי", en: "Technology that serves human judgement" } },
  new_economy: { he: "כלכלה חדשה", en: "New economy", hue: 38, blurb: { he: "דרכים אחרות להחליף ערך", en: "Other ways to exchange value" } },
  education: { he: "חינוך", en: "Education", hue: 205, blurb: { he: "ללמוד תוך כדי עשייה", en: "Learning by doing" } },
  sustainability: { he: "קיימות", en: "Sustainability", hue: 128, blurb: { he: "פחות בזבוז, יותר חיים", en: "Less waste, more life" } },
  civic_innovation: { he: "ממשל ואזרחות", en: "Civic innovation", hue: 340, blurb: { he: "להחליט יחד על מה שמשפיע עלינו", en: "Deciding together on what affects us" } },
  collaboration: { he: "שיתוף פעולה", en: "Collaboration", hue: 20, blurb: { he: "לעבוד ביחד בלי לאבד את הקול", en: "Working together without losing your voice" } },
  technology: { he: "טכנולוגיה", en: "Technology", hue: 225, blurb: { he: "כלים פתוחים ופשוטים", en: "Open, simple tools" } },
  future_of_work: { he: "עתיד העבודה", en: "Future of work", hue: 300, blurb: { he: "איך נעבוד ומה נרוויח מזה", en: "How we will work, and what we gain from it" } },
  collective_intelligence: { he: "חכמה קולקטיבית", en: "Collective intelligence", hue: 180, blurb: { he: "חושבים ומחליטים כקבוצה", en: "Thinking and deciding as a group" } },
  local_resilience: { he: "חוסן מקומי", en: "Local resilience", hue: 10, blurb: { he: "שכנים שיודעים לסמוך זה על זה", en: "Neighbours who can rely on each other" } },
};

export function domainInfo(key: string): DomainInfo {
  return DOMAINS[key] ?? { he: humanize(key), en: humanize(key), hue: 160, blurb: { he: "", en: "" } };
}

export function domainLabel(key: string, locale: "he" | "en" = "he"): string {
  return domainInfo(key)[locale];
}

// -------------------------------------------------- need / offer types ------

export interface ExchangeTypeInfo extends Label {
  /** lucide icon name, resolved in components/TypeIcon.tsx */
  icon: string;
  /** Types that can plausibly answer a need of this type (besides itself). */
  related: string[];
}

export const EXCHANGE_TYPES: Record<string, ExchangeTypeInfo> = {
  community: { he: "קהילה", en: "Community", icon: "Users", related: ["partnership"] },
  knowledge: { he: "ידע", en: "Knowledge", icon: "BookOpen", related: ["mentorship", "research"] },
  skills: { he: "כישורים וידיים", en: "Skills & hands", icon: "HandHeart", related: ["technology", "design", "mentorship"] },
  technology: { he: "טכנולוגיה", en: "Technology", icon: "Cpu", related: ["skills"] },
  funding: { he: "מימון", en: "Funding", icon: "Coins", related: ["partnership"] },
  space: { he: "מרחב", en: "Space", icon: "Warehouse", related: [] },
  partnership: { he: "שותפות", en: "Partnership", icon: "Handshake", related: ["community"] },
  research: { he: "מחקר", en: "Research", icon: "FlaskConical", related: ["data", "knowledge"] },
  mentorship: { he: "ליווי והדרכה", en: "Mentorship", icon: "Compass", related: ["knowledge", "skills", "facilitation"] },
  data: { he: "נתונים", en: "Data", icon: "Database", related: ["research"] },
  design: { he: "עיצוב", en: "Design", icon: "PenTool", related: ["skills"] },
  facilitation: { he: "הנחיה ושיטות", en: "Facilitation", icon: "MessagesSquare", related: ["knowledge", "mentorship"] },
};

export function exchangeType(key: string): ExchangeTypeInfo {
  return (
    EXCHANGE_TYPES[key] ?? {
      he: humanize(key),
      en: humanize(key),
      icon: "Sparkles",
      related: [],
    }
  );
}

/** How well does an offer of type `offer` answer a need of type `need`? */
export function typeCompatibility(need: string, offer: string): "exact" | "related" | "none" {
  if (need === offer) return "exact";
  if (exchangeType(need).related.includes(offer)) return "related";
  return "none";
}

// ------------------------------------------------------- lifecycle stage ----

export interface StageInfo extends Label {
  order: number;
  hint: Label;
}

export const LIFECYCLE_STAGES: Record<LifecycleStage, StageInfo> = {
  idea: { he: "רעיון", en: "Idea", order: 0, hint: { he: "עוד לפני שהתחלנו לעשות", en: "Before we have started doing anything" } },
  exploration: { he: "בחינה ראשונית", en: "Exploration", order: 1, hint: { he: "בודקים שאלות ומדברים עם אנשים", en: "Testing questions and talking with people" } },
  prototype: { he: "אב־טיפוס", en: "Prototype", order: 2, hint: { he: "יש משהו ראשון שאפשר לגעת בו", en: "There is a first thing you can touch" } },
  pilot: { he: "פיילוט", en: "Pilot", order: 3, hint: { he: "מנסים בקטן, בעולם האמיתי", en: "Trying it small, in the real world" } },
  operating: { he: "בפעילות", en: "Operating", order: 4, hint: { he: "עובד ומשרת אנשים בפועל", en: "Working and serving people in practice" } },
  scaling: { he: "בצמיחה", en: "Scaling", order: 5, hint: { he: "מרחיבים למקומות ואנשים נוספים", en: "Expanding to more places and people" } },
};

export const STAGE_ORDER: LifecycleStage[] = (
  Object.entries(LIFECYCLE_STAGES) as [LifecycleStage, StageInfo][]
)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([k]) => k);

export const ACTIVITY_STATUS: Record<ActivityStatus, Label> = {
  active: { he: "פעיל", en: "Active" },
  forming: { he: "בהתגבשות", en: "Forming" },
  paused: { he: "בהפסקה", en: "Paused" },
};

export const GEOGRAPHY_SCOPES: Record<GeographyScope, Label> = {
  local: { he: "מקומי", en: "Local" },
  national: { he: "ארצי", en: "National" },
  global: { he: "עולמי", en: "Global" },
  remote: { he: "מרחוק", en: "Remote" },
};

// ------------------------------------------------ collaboration + steps ----

export const COLLAB_TYPES: Record<string, Label> = {
  experiment: { he: "ניסוי משותף", en: "Joint experiment" },
  research: { he: "מחקר", en: "Research" },
  community: { he: "בניית קהילה", en: "Community building" },
  knowledge_exchange: { he: "החלפת ידע", en: "Knowledge exchange" },
  pilot: { he: "פיילוט", en: "Pilot" },
  resource_sharing: { he: "שיתוף משאבים", en: "Resource sharing" },
  co_creation: { he: "יצירה משותפת", en: "Co-creation" },
  mentoring: { he: "ליווי", en: "Mentoring" },
  technology: { he: "פיתוח טכנולוגי", en: "Technology" },
};

export function collabLabel(key: string, locale: Locale = "he"): string {
  return COLLAB_TYPES[key]?.[locale] ?? humanize(key);
}

export type NextStepId =
  | "intro_call"
  | "joint_experiment"
  | "knowledge_swap"
  | "pilot"
  | "resource_sharing";

export const NEXT_STEPS: Record<NextStepId, { label: Label; hint: Label }> = {
  intro_call: { label: { he: "שיחת היכרות", en: "Intro call" }, hint: { he: "חצי שעה, בלי התחייבות — לבדוק אם יש כאן משהו.", en: "Half an hour, no commitment — to check whether there is something here." } },
  joint_experiment: { label: { he: "ניסוי משותף", en: "Joint experiment" }, hint: { he: "ניסוי קטן וקצר שמלמד את שני הצדדים משהו.", en: "A small, short experiment that teaches both sides something." } },
  knowledge_swap: { label: { he: "החלפת ידע", en: "Knowledge swap" }, hint: { he: "מפגש שבו כל צד מלמד את השני משהו שהוא כבר יודע.", en: "A meeting where each side teaches the other something it already knows." } },
  pilot: { label: { he: "פיילוט", en: "Pilot" }, hint: { he: "להריץ את הרעיון בקטן, בקהילה אמיתית, לזמן מוגדר.", en: "Run the idea small, in a real community, for a set time." } },
  resource_sharing: { label: { he: "שיתוף משאב", en: "Resource sharing" }, hint: { he: "להשאיל או לחלוק משאב שכבר קיים — מקום, כלי או נתונים.", en: "Lend or share a resource that already exists — a place, a tool or data." } },
};

/** Which next step tends to fit which kind of need. First entry is the natural one. */
export const NEXT_STEPS_BY_NEED_TYPE: Record<string, NextStepId[]> = {
  community: ["pilot", "joint_experiment"],
  knowledge: ["knowledge_swap"],
  skills: ["joint_experiment", "knowledge_swap"],
  technology: ["joint_experiment", "resource_sharing"],
  funding: ["resource_sharing"],
  space: ["resource_sharing"],
  partnership: ["joint_experiment"],
  research: ["joint_experiment", "knowledge_swap"],
  mentorship: ["knowledge_swap"],
  data: ["resource_sharing", "joint_experiment"],
  design: ["joint_experiment"],
  facilitation: ["knowledge_swap", "pilot"],
};

// -------------------------------------------------------------- helpers -----

export function humanize(key: string): string {
  return key.replace(/[_-]+/g, " ").trim();
}
