import { z } from "zod";
import type { DiscoveryContext, DiscoveryResult } from "@/lib/discovery";
import { geographyScopeSchema } from "@/lib/schema";
import { DOMAINS } from "@/lib/taxonomy";

/** Shared shape for the wish form ("use server" files may only export async functions). */
export interface WishState {
  status: "idle" | "error" | "ok";
  error?: string;
  result?: DiscoveryResult;
  /** Echoed back so the form keeps what the person typed. */
  values: WishValues;
}

export interface WishValues {
  wish: string;
  outcome: string;
  domain: string;
  scope: string;
  offer: string;
}

export const initialWishState: WishState = {
  status: "idle",
  values: { wish: "", outcome: "", domain: "", scope: "", offer: "" },
};

/** Validation shared by "find connections" and "save this wish". */
export const wishSchema = z.object({
  wish: z.string().trim().min(6, "ספרו לנו קצת יותר — משפט אחד לפחות.").max(1200),
  outcome: z.string().trim().max(800).default(""),
  domain: z.string().trim().default(""),
  scope: z.union([geographyScopeSchema, z.literal("")]).default(""),
  offer: z.string().trim().max(800).default(""),
});

export type ValidWish = z.infer<typeof wishSchema>;

/** The optional hints handed to discovery — the same ones for the first analysis and every later re-run. */
export function discoveryContext(v: Pick<ValidWish, "outcome" | "offer" | "domain" | "scope">): DiscoveryContext {
  return {
    outcome: v.outcome || undefined,
    offer: v.offer || undefined,
    domain: v.domain && v.domain in DOMAINS ? v.domain : null,
    scope: v.scope || null,
  };
}

/** What is stored in `wishes.interpretation`: what the engine understood, and why it matched what it did. */
export interface WishInterpretation {
  engine: DiscoveryResult["engine"];
  summary: string;
  intent: string;
  topics: { id: string; label: string }[];
  domains: string[];
  keywords: string[];
  has_offer: boolean;
  /** The optional hints the wish was analysed with, so it can be re-analysed identically later. */
  context: { outcome: string; offer: string; domain: string; scope: string };
  matches_at_save: { slug: string; reasons: { kind: string; text: string }[] }[];
  analyzed_at: string;
}

export function buildInterpretation(result: DiscoveryResult, v: ValidWish): WishInterpretation {
  const i = result.interpretation;
  return {
    engine: result.engine,
    summary: i.summary,
    intent: i.intent,
    topics: i.topics,
    domains: i.domains,
    keywords: i.keywords,
    has_offer: i.has_offer,
    context: { outcome: v.outcome, offer: v.offer, domain: v.domain, scope: v.scope },
    matches_at_save: result.matches.map((m) => ({
      slug: m.project.slug,
      reasons: (result.reasons[m.project.id] ?? []).map((r) => ({ kind: r.kind, text: r.text })),
    })),
    analyzed_at: new Date().toISOString(),
  };
}

export type SaveWishResult =
  | { status: "saved"; id: string }
  | { status: "auth_required" }
  | { status: "error"; error: string };

export const WISH_STATUS = {
  open: "פתוחה",
  exploring: "בבדיקה",
  connected: "יש חיבור",
  in_progress: "בתהליך",
  fulfilled: "התגשמה",
  archived: "בארכיון",
} as const;

export type WishStatus = keyof typeof WISH_STATUS;

export interface WishRow {
  id: string;
  user_id: string;
  text: string;
  desired_outcome: string | null;
  domains: string[];
  location_scope: string | null;
  time_horizon: string | null;
  visibility: "private" | "public";
  status: WishStatus;
  interpretation: Partial<WishInterpretation>;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------ draft kept across sign-in --

const DRAFT_KEY = "hamama:wish-draft";
const DRAFT_TTL_MS = 60 * 60 * 1000;

/**
 * An anonymous visitor can analyse a wish first; signing in (Google redirect, or a magic link opened in
 * another tab) leaves the page, so the text waits in this browser for an hour and is saved on return.
 * localStorage, not a cookie: Hebrew text can exceed the 4 KB cookie limit. It never leaves the browser
 * until the person is signed in and the server action saves it.
 */
export function rememberWishDraft(values: WishValues): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ values, at: Date.now() }));
  } catch {
    /* storage unavailable (private mode): the person will simply write the wish again */
  }
}

export function takeWishDraft(): WishValues | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const { values, at } = JSON.parse(raw) as { values: WishValues; at: number };
    if (Date.now() - at > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return values;
  } catch {
    return null;
  }
}

export function forgetWishDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
