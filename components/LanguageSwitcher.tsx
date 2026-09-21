"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Languages } from "lucide-react";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import { LOCALES, LOCALE_META, localePath, splitLocale, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Switches the current page to the other language. Today there are two languages, so it is one link to the
 * other one; with more it becomes a list. A plain <a> on purpose: switching language changes `<html lang dir>`,
 * so a full page load is the honest thing to do. The proxy remembers the choice in a cookie.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const m = useMessages();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const path = splitLocale(pathname).path;
  const others = LOCALES.filter((l): l is Locale => l !== locale);

  return (
    <>
      {others.map((other) => (
        <a
          key={other}
          href={localePath(other, `${path}${search ? `?${search}` : ""}`)}
          hrefLang={other}
          lang={other}
          aria-label={m.nav.switchToAria}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink",
            className,
          )}
        >
          <Languages className="size-4" aria-hidden="true" />
          {LOCALE_META[other].name}
        </a>
      ))}
    </>
  );
}
