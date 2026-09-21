"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { localePath, type Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/he";

interface LocaleContextValue {
  locale: Locale;
  messages: Messages;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** Hands the current locale and its dictionary (only that one language) to every client component. */
export function LocaleProvider({ locale, messages, children }: LocaleContextValue & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale/useMessages must be used inside <LocaleProvider>.");
  return ctx;
}

export function useLocale(): Locale {
  return useLocaleContext().locale;
}

export function useMessages(): Messages {
  return useLocaleContext().messages;
}

/** `lp("/projects")` → "/en/projects" — for router.push / router.replace and form actions. */
export function useLocalePath(): (href: string) => string {
  const locale = useLocale();
  return useMemo(() => (href: string) => localePath(locale, href), [locale]);
}
