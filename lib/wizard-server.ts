import type { Locale } from "@/lib/i18n/config";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { getMessagesFor } from "@/lib/i18n/messages";
import { projectToCreateArgs, type CreateProjectArgs } from "@/lib/project-mapper";
import { projectSchema } from "@/lib/schema";
import { buildProject, draftSchema, slugify, validateStep, type StepId } from "@/lib/wizard";

// ------------------------------------------------------ create in Supabase ---

export type PreparedProject = { ok: true; slug: string; args: CreateProjectArgs } | { ok: false; error: string };

/**
 * Everything the server checks before it asks the database to create a project, as a pure function:
 * shape of the draft (never trust the browser), the wizard's own step rules, and the app's project
 * schema. The slug is only the REQUESTED one — the database picks a free one (name, name-2, …).
 * Identity, owner and publication state are not part of the result; the database decides them.
 *
 * Server-only (it imports the dictionaries): client code uses lib/wizard.ts. The text the person typed is stored
 * under `locale`, and error messages come back in it.
 */
export function prepareNewProject(rawDraft: unknown, locale: Locale = DEFAULT_LOCALE): PreparedProject {
  const messages = getMessagesFor(locale).wizard.errors;
  const parsed = draftSchema.safeParse(rawDraft);
  if (!parsed.success) return { ok: false, error: messages.invalidDraft };

  const slug = parsed.data.slug.trim() || slugify(parsed.data.name);
  const draft = { ...parsed.data, slug };
  for (const step of ["identity", "intent", "details"] as StepId[]) {
    const problems = Object.values(validateStep(step, draft, messages));
    if (problems.length) return { ok: false, error: problems[0] };
  }

  const project = projectSchema.safeParse(buildProject(draft, false, locale));
  if (!project.success) {
    const issue = project.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".") || messages.projectFallback}: ${issue?.message ?? messages.invalidValue}` };
  }
  return { ok: true, slug, args: projectToCreateArgs(project.data) };
}
