import { z } from "zod";
import { LOCALES } from "@/lib/i18n/config";

/**
 * Zod schema for one project file under /data/projects/.
 *
 * Design notes
 * - Keys are English snake_case; text is bilingual (he / en).
 * - Vocabularies that will grow over time (domains, need/offer types,
 *   collaboration types) are validated by *shape*, not by a closed list, so a
 *   new domain in a JSON file never makes the whole file invalid. Known values
 *   get nice labels from lib/taxonomy.ts; unknown values fall back gracefully.
 * - Closed vocabularies (lifecycle stage, statuses) are enums, because the UI
 *   logic depends on them.
 */

const nonEmpty = z.string().trim().min(1);
const key = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]*$/, "expected a snake_case key");

const localeSchema = z.enum(LOCALES);

/** A text that is still exactly what the automatic translation produced: from which language, and when. */
export const machineMarkSchema = z.object({ from: localeSchema, at: z.iso.datetime() });

export const localizedTextSchema = z
  .object({
    default: z.string().optional(),
    translations: z
      .object({
        he: z.string().optional(),
        en: z.string().optional(),
      })
      .default({}),
    /**
     * Optional: which translations are unedited automatic translations (language → source + time).
     * A language is dropped from here as soon as someone edits its text by hand.
     */
    machine: z.partialRecord(localeSchema, machineMarkSchema).optional(),
  })
  .refine(
    (v) => Boolean(v.default?.trim() || v.translations.he?.trim() || v.translations.en?.trim()),
    { message: "localized text needs at least one non-empty value" },
  );

export const lifecycleStageSchema = z.enum([
  "idea",
  "exploration",
  "prototype",
  "pilot",
  "operating",
  "scaling",
]);

export const activityStatusSchema = z.enum(["active", "forming", "paused"]);
export const needStatusSchema = z.enum(["open", "in_conversation", "fulfilled"]);
export const geographyScopeSchema = z.enum(["local", "national", "global", "remote"]);

const optionalUrl = z.union([z.url(), z.null()]).optional().default(null);

export const needSchema = z.object({
  id: nonEmpty,
  type: key,
  /** Short noun phrase, reads well after "מחפש…". Optional; falls back to the description. */
  title: localizedTextSchema.optional(),
  description: localizedTextSchema,
  /** Optional English tags that sharpen matching across languages. */
  keywords: z.array(z.string()).optional().default([]),
  status: needStatusSchema.default("open"),
});

export const offerSchema = z.object({
  id: nonEmpty,
  type: key,
  /** Short noun phrase, reads well after "מציע…". */
  title: localizedTextSchema.optional(),
  description: localizedTextSchema,
  keywords: z.array(z.string()).optional().default([]),
});

export const stewardSchema = z.object({
  name: nonEmpty,
  role: localizedTextSchema.optional(),
  bio: localizedTextSchema.optional(),
});

export const projectSchema = z.object({
  id: nonEmpty,
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lowercase latin letters, digits and dashes")
    // "new" is the add-project route.
    .refine((slug) => slug !== "new", "slug \"new\" is reserved"),

  name: localizedTextSchema,
  tagline: localizedTextSchema,
  short_description: localizedTextSchema,

  vision: z.object({ future_world: localizedTextSchema }),
  problem_space: z.object({ primary_problem: localizedTextSchema }),
  desired_change: localizedTextSchema,

  domains: z.array(key).min(1),

  status: z.object({
    lifecycle_stage: lifecycleStageSchema,
    activity_status: activityStatusSchema.default("active"),
  }),

  geography: z
    .object({
      scope: geographyScopeSchema,
      place: localizedTextSchema.optional(),
    })
    .optional(),

  people: z.object({ stewards: z.array(stewardSchema).default([]) }).default({ stewards: [] }),

  current_needs: z.array(needSchema).default([]),
  offers: z.array(offerSchema).default([]),

  collaboration_preferences: z
    .object({ types: z.array(key).default([]) })
    .default({ types: [] }),

  links: z
    .object({
      website: optionalUrl,
      linkedin: optionalUrl,
      github: optionalUrl,
    })
    .default({ website: null, linkedin: null, github: null }),

  portal: z.object({
    visibility: z.enum(["public", "unlisted", "private"]).default("public"),
    review_status: z.enum(["draft", "pending_review", "published"]).default("pending_review"),
    last_updated: z.iso.date(),
    /** True for seed/demo content. Shown in the UI as an "example" marker. */
    is_demo: z.boolean().optional().default(false),
  }),
});

export const projectFileSchema = z.object({
  schema_version: z.literal("1.0"),
  /** Free-form note for humans editing the file (ignored by the app). */
  _comment: z.string().optional(),
  project: projectSchema,
});
