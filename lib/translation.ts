import { z } from "zod";
import { LOCALE_META, type Locale } from "@/lib/i18n/config";

/**
 * Automatic translation of an initiative's texts with the OpenAI API — SERVER ONLY.
 *
 * Only the server action in app/[lang]/projects/actions.ts calls this. The API key is read from
 * `OPENAI_API_KEY` (never NEXT_PUBLIC_, so it can never reach the browser). Without a key the feature is
 * simply unavailable: the wizard says so and people write the other language themselves.
 *
 * The texts go in as a list of { id, text } and come back the same way (Structured Outputs), so every
 * translated text lands in exactly the field it came from. Plain `fetch` — no SDK dependency.
 */

export interface TranslationItem {
  id: string;
  text: string;
}

export interface TranslationRequest {
  from: Locale;
  to: Locale;
  /** The initiative's name, which is never translated inside the texts. */
  name: string;
  items: TranslationItem[];
}

export type TranslationOutcome =
  | { ok: true; items: TranslationItem[] }
  | { ok: false; reason: "unconfigured" | "failed" };

/** Limits for one request (the wizard's own field limits keep real requests well below them). */
export const TRANSLATION_LIMITS = { items: 60, idLength: 200, textLength: 6000, totalLength: 40_000 };

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const TIMEOUT_MS = 90_000;

export function isTranslationConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** Extra guidance per target language. */
const TARGET_NOTES: Partial<Record<Locale, string>> = {
  he: "Write modern Israeli Hebrew without niqqud. When addressing readers, use the plural (אתם), as the rest of the site does.",
  en: "Write clear, warm, natural English.",
};

export function translationInstructions(from: Locale, to: Locale, name: string): string {
  const source = LOCALE_META[from].englishName;
  const target = LOCALE_META[to].englishName;
  return [
    `You translate the texts of one initiative's profile on Hamama, a portal where social and civic future-oriented initiatives describe what they do, what they need and what they offer. Translate from ${source} to ${target}.`,
    "",
    "Rules:",
    `- Write natural, fluent ${target}, the way a native speaker would write this kind of profile — not a word-for-word translation. Keep the meaning, tone and level of detail; do not add, drop, summarise or explain anything.`,
    "- Keep the formatting exactly: line breaks, empty lines between paragraphs, bullet or numbered lists, emphasis marks.",
    "- Keep unchanged: URLs, e-mail addresses, @handles, hashtags, numbers, code, and names of people, organisations, products and programmes. Places may use their common name in the target language (for example ירושלים → Jerusalem).",
    `- The initiative is called "${name}". Do not translate this name — wherever it appears, write it exactly like that.`,
    "- Use the same terminology across all items: they are fields of the same profile (tagline, description, vision, problem, desired change, needs, offers).",
    `- Every item has an "id". Return every item, with the same id and only its translation. Never merge, split, reorder or skip items. If an item is already in ${target}, return it unchanged.`,
    ...(TARGET_NOTES[to] ? [`- ${TARGET_NOTES[to]}`] : []),
  ].join("\n");
}

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "translations",
    strict: true,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, text: { type: "string" } },
            required: ["id", "text"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
} as const;

const completionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable().optional(), refusal: z.string().nullable().optional() }) }))
    .min(1),
});
const itemsSchema = z.object({ items: z.array(z.object({ id: z.string(), text: z.string() })) });

/**
 * Translate every item. Succeeds only when EVERY requested id comes back with text — a partial answer is
 * treated as a failure rather than silently leaving some fields untranslated.
 */
export async function translateItems(
  request: TranslationRequest,
  options: { fetch?: typeof fetch; apiKey?: string; model?: string } = {},
): Promise<TranslationOutcome> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "unconfigured" };
  if (!request.items.length) return { ok: true, items: [] };
  const model = options.model ?? (process.env.OPENAI_TRANSLATION_MODEL?.trim() || DEFAULT_MODEL);
  const doFetch = options.fetch ?? fetch;

  try {
    // OPENAI_BASE_URL: optional, for an OpenAI-compatible gateway or proxy.
    const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
    const res = await doFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: translationInstructions(request.from, request.to, request.name) },
          { role: "user", content: JSON.stringify({ items: request.items }) },
        ],
        response_format: RESPONSE_FORMAT,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // Never log the request (it carries the key in a header) — only what OpenAI said.
      console.error("[hamama] translation failed:", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return { ok: false, reason: "failed" };
    }

    const completion = completionSchema.safeParse(await res.json());
    const message = completion.success ? completion.data.choices[0].message : null;
    if (!message?.content) {
      console.error("[hamama] translation: no content", message?.refusal ?? "");
      return { ok: false, reason: "failed" };
    }
    const parsed = itemsSchema.safeParse(JSON.parse(message.content));
    if (!parsed.success) return { ok: false, reason: "failed" };

    const byId = new Map(parsed.data.items.map((item) => [item.id, item.text]));
    const items = request.items.map((item) => ({ id: item.id, text: byId.get(item.id)?.trim() ?? "" }));
    if (items.some((item) => !item.text)) {
      console.error("[hamama] translation: incomplete answer");
      return { ok: false, reason: "failed" };
    }
    return { ok: true, items };
  } catch (err) {
    console.error("[hamama] translation error:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "failed" };
  }
}

// ------------------------------------------------------------ rate limit ---

const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 20;
const recent = new Map<string, number[]>();

/**
 * A small per-person brake on paid API calls (in memory, per server instance — enough for a single
 * Railway service; it is a cost guard, not a security boundary).
 */
export function allowTranslation(who: string, now = Date.now()): boolean {
  const times = (recent.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= PER_WINDOW) {
    recent.set(who, times);
    return false;
  }
  times.push(now);
  recent.set(who, times);
  return true;
}

/** What the wizard's translate action answers (see translateTexts in app/[lang]/projects/actions.ts). */
export type TranslateResult =
  | { status: "ok"; items: TranslationItem[]; at: string }
  | { status: "auth_required" }
  | { status: "error"; reason: "unavailable" | "failed" | "rate_limited" | "invalid" };
