import { DEFAULT_LOCALE, hasLocale, type Locale } from "@/lib/i18n/config";
import { getMessagesFor, type Messages } from "@/lib/i18n/messages";

/**
 * Server Actions cannot read the URL's locale, so the browser sends it along (a hidden form field or an
 * argument). It comes from the client, so it is validated against the supported list; anything else falls
 * back to the default language. The locale only picks the language of a message — it grants nothing.
 */
export function actionLocale(value: unknown): Locale {
  return hasLocale(value) ? value : DEFAULT_LOCALE;
}

export function actionMessages(value: unknown): Messages {
  return getMessagesFor(actionLocale(value));
}
