import type { Metadata, Viewport } from "next";
import { Assistant } from "next/font/google";
import { Suspense } from "react";
import { AccountMenu } from "@/components/AccountMenu";
import { LocaleProvider } from "@/components/LocaleProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { LOCALES, LOCALE_META } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import "../globals.css";

const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  variable: "--font-assistant",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const m = (await getMessages()).meta;
  return {
    title: {
      default: m.titleDefault,
      template: m.titleTemplate,
    },
    description: m.description,
  };
}

/**
 * Every page reads live data (Supabase) and the signed-in user, so nothing is prerendered at build time.
 * (A build never needs database access, and a page can never be served from a snapshot of old data.)
 */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#faf8f3",
};

/** One entry per language, so the language segment is always a known value. */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} dir={LOCALE_META[locale].dir} className={assistant.variable}>
      <body className="flex min-h-dvh flex-col">
        <LocaleProvider locale={locale} messages={messages}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-leaf-700 focus:px-5 focus:py-2 focus:text-white"
          >
            {messages.common.skipToContent}
          </a>
          <SiteHeader
            account={
              <Suspense fallback={null}>
                <AccountMenu />
              </Suspense>
            }
          />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </LocaleProvider>
      </body>
    </html>
  );
}
