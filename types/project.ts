import type { z } from "zod";
import type {
  activityStatusSchema,
  geographyScopeSchema,
  lifecycleStageSchema,
  localizedTextSchema,
  needSchema,
  offerSchema,
  projectFileSchema,
  projectSchema,
  stewardSchema,
} from "@/lib/schema";

/** Types are derived from the Zod schema so the two can never drift apart. */
export type LocalizedText = z.infer<typeof localizedTextSchema>;
export type LifecycleStage = z.infer<typeof lifecycleStageSchema>;
export type ActivityStatus = z.infer<typeof activityStatusSchema>;
export type GeographyScope = z.infer<typeof geographyScopeSchema>;
export type Need = z.infer<typeof needSchema>;
export type Offer = z.infer<typeof offerSchema>;
export type Steward = z.infer<typeof stewardSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectFile = z.infer<typeof projectFileSchema>;

/** A file that was found in /data/projects but could not be used. */
export interface ProjectLoadIssue {
  file: string;
  message: string;
}
