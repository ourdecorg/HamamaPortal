import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser, safeNext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "כניסה",
  robots: { index: false },
};

const ERRORS: Record<string, string> = {
  oauth: "לא הצלחנו להתחיל את הכניסה עם Google. נסו שוב, או היכנסו עם קישור במייל.",
  denied: "הכניסה בוטלה. אפשר לנסות שוב.",
  callback: "הקישור פג תוקף או כבר נוצל. בקשו קישור חדש.",
  unconfigured: "הכניסה עדיין לא הוגדרה בשרת הזה.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;

  if (await getCurrentUser()) redirect(next);

  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-20">
      <div className="mx-auto max-w-md">
        <header className="mb-10 text-center">
          <h1 className="font-display text-4xl font-semibold leading-tight text-leaf-900 sm:text-5xl">כניסה לחממה</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-2">
            אפשר לגלול, לחפש ולהכיר מיזמים בלי להתחבר. כניסה נחוצה רק כדי לשמור משהו — משאלה, חיבור או מיזם.
          </p>
        </header>

        {error && (
          <p role="alert" className="mb-6 rounded-2xl bg-need-50 px-5 py-3 text-sm font-medium text-need-700">
            {error}
          </p>
        )}

        <div className="rounded-[2rem] border border-line bg-white/80 p-6 shadow-soft sm:p-8">
          {isSupabaseConfigured() ? (
            <LoginForm next={next} />
          ) : (
            <p className="leading-relaxed text-ink-2">
              הפורטל רץ כרגע במצב הדגמה, בלי מסד נתונים — אין כניסה ואין שמירה. הגדרת Supabase מפורטת ב-
              <code dir="ltr" className="mx-1 rounded bg-paper-2 px-1.5 py-0.5 text-xs">docs/SUPABASE.md</code>.
            </p>
          )}
        </div>

        <p className="mt-6 flex items-start justify-center gap-2 text-center text-sm text-ink-3">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          אנחנו שומרים רק מה שביקשתם לשמור. משאלות הן פרטיות כברירת מחדל.
        </p>

        <div className="mt-8 text-center">
          <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            חזרה לדף הבית
          </Link>
        </div>
      </div>
    </div>
  );
}
