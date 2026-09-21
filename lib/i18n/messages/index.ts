import { DEFAULT_LOCALE, hasLocale, type Locale } from "@/lib/i18n/config";
import { en } from "@/lib/i18n/messages/en";
import { he, type Messages } from "@/lib/i18n/messages/he";

export type { Messages };

const MESSAGES: Record<Locale, Messages> = { he, en };

/**
 * The dictionary for a locale. Importing this pulls in EVERY language, so it is for server code only
 * (pages, actions, the matching and discovery engines). Client components read the one dictionary they
 * need from the context (components/LocaleProvider.tsx) instead.
 */
export function getMessagesFor(locale: Locale | string | null | undefined): Messages {
  return MESSAGES[hasLocale(locale) ? locale : DEFAULT_LOCALE];
}
