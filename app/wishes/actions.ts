"use server";

import { z } from "zod";
import { discover } from "@/lib/discovery";
import { getProjects } from "@/lib/projects";
import { geographyScopeSchema } from "@/lib/schema";
import { DOMAINS } from "@/lib/taxonomy";
import type { WishState } from "@/lib/wish";

const wishSchema = z.object({
  wish: z.string().trim().min(6, "ספרו לנו קצת יותר — משפט אחד לפחות.").max(1200),
  outcome: z.string().trim().max(800).default(""),
  domain: z.string().trim().default(""),
  scope: z.union([geographyScopeSchema, z.literal("")]).default(""),
  offer: z.string().trim().max(800).default(""),
});

const text = (fd: FormData, key: string) => (typeof fd.get(key) === "string" ? (fd.get(key) as string) : "");

/**
 * Analyse a wish against the existing projects.
 * Nothing is stored: the wish exists only for the length of this request.
 * (Running on the server also means a future LLM key never reaches the browser.)
 */
export async function analyzeWish(_prev: WishState, formData: FormData): Promise<WishState> {
  const raw = {
    wish: text(formData, "wish"),
    outcome: text(formData, "outcome"),
    domain: text(formData, "domain"),
    scope: text(formData, "scope"),
    offer: text(formData, "offer"),
  };

  const parsed = wishSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", error: parsed.error.issues[0]?.message ?? "משהו בטופס לא תקין.", values: raw };
  }
  const v = parsed.data;

  const projects = await getProjects();
  const result = await discover({
    query: v.wish,
    projects,
    context: {
      outcome: v.outcome || undefined,
      offer: v.offer || undefined,
      domain: v.domain && v.domain in DOMAINS ? v.domain : null,
      scope: v.scope || null,
    },
  });

  return { status: "ok", result, values: raw };
}
