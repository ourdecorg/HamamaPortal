import { draftSchema, type Draft } from "@/lib/wizard";

/**
 * A visitor can fill in the whole "add a project" wizard before signing in. Signing in leaves the page
 * (Google redirect, or a magic link opened in another tab), so the draft waits in this browser for two
 * hours and is submitted when the person comes back to /projects/new?resume=1.
 *
 * Same approach as the wish draft (lib/wish.ts): localStorage, not a cookie (Hebrew text can exceed the
 * 4 KB cookie limit), and it never leaves the browser until the person is signed in and the server action
 * creates the project. What comes back is re-validated with the same schema the server uses.
 */

export const PROJECT_DRAFT_KEY = "hamama:project-draft";
export const PROJECT_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

export function rememberProjectDraft(draft: Draft, storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(PROJECT_DRAFT_KEY, JSON.stringify({ draft, at: Date.now() }));
  } catch {
    /* storage unavailable (private mode): the person will fill the wizard in again */
  }
}

export function takeProjectDraft(
  storage: Pick<Storage, "getItem" | "removeItem"> = localStorage,
  now = Date.now(),
): Draft | null {
  try {
    const raw = storage.getItem(PROJECT_DRAFT_KEY);
    if (!raw) return null;
    const { draft, at } = JSON.parse(raw) as { draft: unknown; at: number };
    if (typeof at !== "number" || now - at > PROJECT_DRAFT_TTL_MS) {
      storage.removeItem(PROJECT_DRAFT_KEY);
      return null;
    }
    const parsed = draftSchema.safeParse(draft);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function forgetProjectDraft(storage: Pick<Storage, "removeItem"> = localStorage): void {
  try {
    storage.removeItem(PROJECT_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
