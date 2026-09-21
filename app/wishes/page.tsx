import type { Metadata } from "next";
import { ResumeWish } from "@/components/ResumeWish";
import { WishForm } from "@/components/WishForm";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "באר המשאלות",
  description: "ספרו מה הייתם רוצים שיקרה — ונבדוק אם כבר יש מי שמנסה ליצור בדיוק את זה.",
};

export default async function WishesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").slice(0, 600);
  const canSave = isSupabaseConfigured();
  const signedIn = canSave && Boolean(await getCurrentUser());

  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-16">
      <div className="mx-auto max-w-3xl">
        <header className="mb-12 text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-sun/25 px-4 py-1.5 text-sm font-semibold text-need-700">
            באר המשאלות
            <span className="text-need-700/50">·</span>
            <span dir="ltr">Wish Well</span>
          </p>
          <h1 className="font-display text-5xl font-semibold leading-tight text-leaf-900 sm:text-7xl">מה היית רוצה שיקרה?</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
            משאלה היא נקודת התחלה. ספרו לנו עליה — ואולי כבר קיימים אנשים או מיזמים שמנסים ליצור בדיוק את זה.
          </p>
        </header>

        {sp.resume && <ResumeWish />}
        <WishForm initialWish={q} canSave={canSave} signedIn={signedIn} />
      </div>
    </div>
  );
}
