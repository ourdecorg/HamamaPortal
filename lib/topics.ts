import type { Label } from "@/lib/taxonomy";
import { normalize, stem, tokenize } from "@/lib/text";

/**
 * A small hand-written lexicon that turns free text into *topics*.
 * Each topic knows the domains and need/offer types it points to, which is how
 * the heuristic discovery engine "understands" a wish without any model.
 *
 * This file is the thing an LLM would replace or enrich later.
 */

export interface Topic {
  id: string;
  /** Label shown in the interpretation panel. */
  label: Label;
  /** Words (he/en) that signal this topic. Stemmed automatically. */
  triggers: string[];
  domains: string[];
  /** Need/offer types this topic tends to involve. */
  types: string[];
}

export const TOPICS: Topic[] = [
  {
    id: "community",
    label: { he: "קהילה", en: "Community" },
    triggers: ["קהילה", "קהילות", "קהילתי", "שכנים", "שכונה", "שכונתי", "מקומי", "מקומית", "מקומיות", "מקומיים", "community", "communities", "neighbors", "neighbourhood", "neighborhood"],
    domains: ["communities", "local_resilience"],
    types: ["community"],
  },
  {
    id: "sharing",
    label: { he: "שיתוף", en: "Sharing" },
    triggers: ["שיתוף", "לשתף", "משתפים", "חלוקה", "לחלוק", "share", "sharing", "shared", "commons"],
    domains: ["collaboration", "communities"],
    types: ["partnership"],
  },
  {
    id: "resources",
    label: { he: "משאבים", en: "Resources" },
    triggers: ["משאבים", "משאב", "ציוד", "כלים", "resources", "resource", "tools", "equipment"],
    domains: ["sustainability", "new_economy"],
    types: ["space", "funding", "data"],
  },
  {
    id: "knowledge",
    label: { he: "ידע ולמידה", en: "Knowledge and learning" },
    triggers: ["ידע", "ללמוד", "למידה", "לימוד", "ללמד", "הדרכה", "knowledge", "learning", "learn", "teach", "training"],
    domains: ["education"],
    types: ["knowledge", "mentorship"],
  },
  {
    id: "ai",
    label: { he: "בינה מלאכותית", en: "Artificial intelligence" },
    triggers: ["בינה", "מלאכותית", "ai", "llm", "gpt", "אלגוריתם", "אלגוריתמים", "מודלים", "machine"],
    domains: ["ai_humans", "technology"],
    types: ["technology", "skills"],
  },
  {
    id: "technology",
    label: { he: "טכנולוגיה", en: "Technology" },
    triggers: ["טכנולוגיה", "טכנולוגי", "אפליקציה", "תוכנה", "דיגיטלי", "קוד", "מפתח", "מפתחים", "פיתוח", "software", "app", "code", "developer", "developers", "digital", "engineer", "engineers", "tech"],
    domains: ["technology"],
    types: ["technology", "skills"],
  },
  {
    id: "work",
    label: { he: "עתיד העבודה", en: "The future of work" },
    triggers: ["עבודה", "עובדים", "פרילנסרים", "פרילנס", "קריירה", "תעסוקה", "עצמאים", "work", "freelance", "freelancers", "career", "jobs", "workplace"],
    domains: ["future_of_work"],
    types: [],
  },
  {
    id: "economy",
    label: { he: "כלכלה אחרת", en: "A different economy" },
    triggers: ["כלכלה", "כלכלי", "כסף", "מטבע", "אשראי", "זמן", "economy", "economic", "money", "currency", "credit", "exchange", "timebank"],
    domains: ["new_economy"],
    types: ["funding"],
  },
  {
    id: "education",
    label: { he: "חינוך", en: "Education" },
    triggers: ["חינוך", "חינוכי", "ספר", "תלמידים", "נוער", "מורים", "צעירים", "education", "school", "youth", "students", "teens", "teenagers"],
    domains: ["education"],
    types: ["mentorship"],
  },
  {
    id: "sustainability",
    label: { he: "קיימות", en: "Sustainability" },
    triggers: ["קיימות", "סביבה", "אקלים", "מיחזור", "תיקון", "בזבוז", "sustainability", "climate", "recycling", "repair", "waste", "environment"],
    domains: ["sustainability"],
    types: ["space", "skills"],
  },
  {
    id: "civic",
    label: { he: "ממשל ואזרחות", en: "Governance and citizenship" },
    triggers: ["ממשל", "עירייה", "עירוני", "מועצה", "תקציב", "דמוקרטיה", "אזרחים", "תושבים", "השתתפות", "civic", "government", "municipal", "democracy", "budget", "city", "council"],
    domains: ["civic_innovation"],
    types: ["data", "partnership"],
  },
  {
    id: "deliberation",
    label: { he: "קבלת החלטות משותפת", en: "Shared decision-making" },
    triggers: ["החלטות", "דיון", "דיאלוג", "קבוצה", "קבוצות", "הנחיה", "קולקטיבית", "קולקטיבי", "deliberation", "decisions", "decision", "facilitation", "collective", "consensus"],
    domains: ["collective_intelligence", "collaboration"],
    types: ["facilitation"],
  },
  {
    id: "resilience",
    label: { he: "חוסן וכוננות", en: "Resilience and preparedness" },
    triggers: ["חוסן", "חירום", "מוכנות", "משבר", "משברים", "resilience", "emergency", "preparedness", "crisis"],
    domains: ["local_resilience"],
    types: ["community", "knowledge"],
  },
  {
    id: "funding",
    label: { he: "מימון", en: "Funding" },
    triggers: ["מימון", "גיוס", "funding", "grant", "grants", "donation", "investment"],
    domains: ["new_economy"],
    types: ["funding"],
  },
  {
    id: "space",
    label: { he: "מרחב פיזי", en: "Physical space" },
    triggers: ["מרחב", "חלל", "אולם", "חדר", "סדנה", "מחסן", "space", "venue", "workshop", "room"],
    domains: ["communities", "sustainability"],
    types: ["space"],
  },
  {
    id: "mentoring",
    label: { he: "ליווי והדרכה", en: "Mentoring and guidance" },
    triggers: ["ליווי", "מנטור", "מנטורים", "מנטורינג", "mentor", "mentors", "mentoring", "guidance", "coach"],
    domains: ["education"],
    types: ["mentorship"],
  },
  {
    id: "research",
    label: { he: "מחקר", en: "Research" },
    triggers: ["מחקר", "סקר", "ראיונות", "חוקר", "חוקרים", "research", "survey", "study", "researcher"],
    domains: [],
    types: ["research", "data"],
  },
  {
    id: "design",
    label: { he: "עיצוב", en: "Design" },
    triggers: ["עיצוב", "מעצב", "מעצבים", "ux", "ui", "design", "designer", "designers"],
    domains: [],
    types: ["design", "skills"],
  },
  {
    id: "data",
    label: { he: "נתונים", en: "Data" },
    triggers: ["נתונים", "מידע", "דאטה", "data", "dataset", "datasets"],
    domains: ["civic_innovation"],
    types: ["data", "research"],
  },
  {
    id: "collaboration",
    label: { he: "שיתוף פעולה", en: "Collaboration" },
    triggers: ["שותפים", "שותפות", "לשתף פעולה", "collaborate", "collaboration", "partners", "partnership"],
    domains: ["collaboration"],
    types: ["partnership"],
  },
];

const TOPIC_STEMS = TOPICS.map((topic) => ({
  topic,
  stems: new Set(topic.triggers.map((w) => stem(normalize(w)))),
}));

export interface DetectedTopic {
  topic: Topic;
  /** The words from the user's text that triggered it. */
  words: string[];
}

/** Which topics does this free text touch? Ordered by how many words hit. */
export function detectTopics(text: string): DetectedTopic[] {
  const found = new Map<string, { topic: Topic; words: Set<string> }>();
  for (const word of tokenize(text)) {
    const s = stem(word);
    for (const entry of TOPIC_STEMS) {
      if (entry.stems.has(s)) {
        const hit = found.get(entry.topic.id) ?? { topic: entry.topic, words: new Set<string>() };
        hit.words.add(word);
        found.set(entry.topic.id, hit);
      }
    }
  }
  return [...found.values()]
    .map((h) => ({ topic: h.topic, words: [...h.words] }))
    .sort((a, b) => b.words.length - a.words.length);
}

// ------------------------------------------------------------- intent -------

export type Intent = "seeking" | "offering" | "creating" | "exploring";

const OFFERING = /יש לי|אני יכול|אני יכולה|ניסיון|לתרום|להתנדב|מתנדב|להציע|מציע|i can offer|i have experience|volunteer|contribute|my experience/i;
const CREATING = /רוצה (ל?יצור|לבנות|לעזור|להקים|לפתוח|שיקרה|שיהיה)|אני רוצה ש|לבנות|להקים|create|build|start a|set up/i;
const SEEKING = /מחפש|מחפשת|רוצה למצוא|צריך|צריכה|זקוק|איפה|מי עוסק|מי כבר|looking for|find|i need|where can/i;

/** Very rough. Offering beats creating beats seeking; otherwise "exploring". */
export function detectIntent(text: string): Intent {
  if (OFFERING.test(text)) return "offering";
  if (CREATING.test(text)) return "creating";
  if (SEEKING.test(text)) return "seeking";
  return "exploring";
}
