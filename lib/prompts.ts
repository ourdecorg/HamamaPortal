import { getMessagesFor } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/config";

/**
 * Example sentences that show what someone can type into the discovery box. They live in the message
 * dictionaries (one set per language); this is the server-side accessor.
 */
export function examplePrompts(locale: Locale): string[] {
  return getMessagesFor(locale).search.prompts;
}
