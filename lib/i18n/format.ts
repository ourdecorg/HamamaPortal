import type { Locale } from "@/lib/i18n/config";

/** Replace {name} placeholders. A placeholder with no value is left visible, which makes a typo easy to spot. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

/** A message with a singular and a plural form; `{n}` is replaced by the count. */
export interface Plural {
  one: string;
  other: string;
}

export function plural(message: Plural, n: number): string {
  return fmt(n === 1 ? message.one : message.other, { n });
}

/** "a, b and c" — Hebrew glues the conjunction to the last word ("a, b וc"). */
export function joinList(items: string[], locale: Locale): string {
  if (items.length <= 1) return items[0] ?? "";
  if (locale === "he") return `${items.slice(0, -1).join(", ")} ו${items[items.length - 1]}`;
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
}
