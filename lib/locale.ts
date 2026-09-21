import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import type { LocalizedText } from "@/types/project";

export { DEFAULT_LOCALE };
export type { Locale };

/** Resolve a localized text: requested locale → default → the other language. */
export function t(text: LocalizedText | undefined | null, locale: Locale = DEFAULT_LOCALE): string {
  if (!text) return "";
  const tr = text.translations;
  const other: Locale = locale === "he" ? "en" : "he";
  return (tr[locale] || text.default || tr[other] || "").trim();
}

/** Every language variant of a text — used for indexing / matching. */
export function allVariants(text: LocalizedText | undefined | null): string[] {
  if (!text) return [];
  return [text.default, text.translations.he, text.translations.en]
    .filter((v): v is string => Boolean(v && v.trim()))
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

/** A short label for a need/offer: its title, or the start of its description. */
export function shortLabel(
  item: { title?: LocalizedText; description: LocalizedText },
  locale: Locale = DEFAULT_LOCALE,
  max = 64,
): string {
  const title = t(item.title, locale);
  if (title) return title;
  const desc = t(item.description, locale);
  if (desc.length <= max) return desc;
  return desc.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

/** Attach a Hebrew prefix letter to a word; Latin names need a hyphen ("ו-VAST"). */
export function withPrefix(prefix: string, word: string): string {
  return /^[A-Za-z0-9]/.test(word) ? `${prefix}-${word}` : `${prefix}${word}`;
}
