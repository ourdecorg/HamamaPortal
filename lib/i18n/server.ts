import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { cache } from "react";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { getMessagesFor, type Messages } from "@/lib/i18n/messages";

/**
 * The locale of the current request, from the `[lang]` segment above the root layout. Callable from any
 * Server Component or server-side helper, without passing it down. NOT available in Server Actions or
 * Route Handlers — those receive the locale from the caller (see `actionLocale`).
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const value = await lang();
  if (!hasLocale(value)) notFound();
  return value;
});

export async function getMessages(): Promise<Messages> {
  return getMessagesFor(await getLocale());
}
