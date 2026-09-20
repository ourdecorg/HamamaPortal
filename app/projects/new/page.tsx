import type { Metadata } from "next";
import { ProjectWizard } from "@/components/ProjectWizard";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "הוספת מיזם",
  description: "תארו מיזם: מה הוא מנסה לשנות, מה הוא צריך ומה הוא מציע. בסוף המיזם מתפרסם בפורטל.",
};

/**
 * Anyone can fill in the wizard. Publishing needs an account: a visitor is sent to sign in at that moment
 * and comes back to /projects/new?resume=1, where the draft that waited in their browser is submitted.
 */
export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const persist = isSupabaseConfigured();
  const signedIn = Boolean(await getCurrentUser());

  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-16">
      <header className="mb-12 max-w-2xl">
        <p className="mb-3 text-sm font-semibold tracking-wide text-leaf-600">הוספת מיזם</p>
        <h1 className="font-display text-4xl font-black leading-tight text-leaf-900 sm:text-6xl">בואו נכיר את המיזם שלכם.</h1>
      </header>
      <ProjectWizard persist={persist} signedIn={signedIn} resume={persist && sp.resume === "1"} />
    </div>
  );
}
