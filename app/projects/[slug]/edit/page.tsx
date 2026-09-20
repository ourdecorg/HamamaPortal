import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";
import { ProjectWizard } from "@/components/ProjectWizard";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { t } from "@/lib/locale";
import { getProjectForEditing } from "@/lib/stewardship";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { draftFromProject } from "@/lib/wizard";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "עריכת מיזם",
  robots: { index: false },
};

/**
 * The same wizard as "add a project", filled with the stored project. Only an approved steward gets the
 * form; the server action (and Row Level Security) re-check that on save.
 */
export default async function EditProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) notFound();
  await requireUser(`/projects/${slug}/edit`);

  const found = await getProjectForEditing(slug);
  if (!found) notFound();
  const { project, stewardship } = found;

  if (stewardship?.status !== "approved") {
    return (
      <div className="page-wrap pb-10 pt-16">
        <div className="mx-auto max-w-xl rounded-[2rem] border border-line bg-white/80 p-8 text-center shadow-soft">
          <Lock className="mx-auto mb-4 size-6 text-ink-3" aria-hidden="true" />
          <h1 className="font-display text-3xl font-bold text-leaf-900">העריכה פתוחה למטפחי המיזם</h1>
          <p className="mt-3 leading-relaxed text-ink-2">
            {stewardship?.status === "pending"
              ? "הבקשה שלכם לטפח את המיזם ממתינה לאישור. אחרי האישור תוכלו לערוך כאן."
              : "כדי לערוך את המיזם צריך לבקש לטפח אותו, ולהמתין לאישור."}
          </p>
          <Link href={`/projects/${slug}#stewardship`} className={cn(buttonVariants({ variant: "primary" }), "mt-6")}>
            לדף המיזם
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-16">
      <header className="mb-12 max-w-2xl">
        <Link href={`/projects/${slug}`} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-leaf-700">
          <ArrowRight className="size-4" /> חזרה לדף המיזם
        </Link>
        <p className="mb-3 text-sm font-semibold tracking-wide text-leaf-600">עריכת מיזם</p>
        <h1 className="font-display text-4xl font-black leading-tight text-leaf-900 sm:text-6xl">{t(project.name)}</h1>
      </header>
      <ProjectWizard mode="edit" slug={slug} initialDraft={draftFromProject(project)} />
    </div>
  );
}
