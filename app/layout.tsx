import type { Metadata, Viewport } from "next";
import { Frank_Ruhl_Libre, Heebo } from "next/font/google";
import { Suspense } from "react";
import { AccountMenu } from "@/components/AccountMenu";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

const frank = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  variable: "--font-frank",
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "חממה | פורטל מיזמי עתיד",
    template: "%s | חממה",
  },
  description:
    "Future Initiatives Portal — תשתית לפעולה משותפת. גלו מיזמי עתיד, מה הם צריכים, מה הם מציעים, ואיפה אפשר לחבר ביניהם.",
};

/**
 * Every page reads live data (Supabase) and the signed-in user, so nothing is prerendered at build time.
 * (A build never needs database access, and a page can never be served from a snapshot of old data.)
 */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#faf8f3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${frank.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-leaf-700 focus:px-5 focus:py-2 focus:text-white"
        >
          דלגו לתוכן
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
      </body>
    </html>
  );
}
