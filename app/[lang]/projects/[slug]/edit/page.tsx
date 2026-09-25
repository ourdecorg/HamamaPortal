import type { Metadata } from "next";
import { Link } from "@/components/LocaleLink";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { PrevArrow } from "@/components/Arrows";
import { ProjectWizard } from "@/components/ProjectWizard";
import { buttonVariants } from "@/components/ui/button";
import { isCurrentUserAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { t } from "@/lib/locale";
import { getProjectForEditing } from "@/lib/stewardship";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { draftFromProject } from "@/lib/wizard";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).meta.editProject.title, robots: { index: false } };
}

/**
 * The same wizard as "add a project", filled with the stored project. Only an approved steward (or an admin)
 * gets the form; the server action (and Row Level Security) re-check that on save.
 */
export default async function EditProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const messages = await getMessages();
  const m = messages.stewardship;
  if (!isSupabaseConfigured()) notFound();
  await requireUser(`/projects/${slug}/edit`);

  const found = await getProjectForEditing(slug);
  if (!found) notFound();
  const { project, stewardship } = found;

  if (stewardship?.status !== "approved" && !(await isCurrentUserAdmin())) {
    return (
      <div className="page-wrap pb-10 pt-16">
        <div className="mx-auto max-w-xl rounded-[2rem] border border-line bg-white/80 p-8 text-center shadow-soft">
          <Lock className="mx-auto mb-4 size-6 text-ink-3" aria-hidden="true" />
          <h1 className="font-display text-3xl font-semibold text-leaf-900">{m.editLockedTitle}</h1>
          <p className="mt-3 leading-relaxed text-ink-2">
            {stewardship?.status === "pending" ? m.editLockedPending : m.editLockedNone}
          </p>
          <Link href={`/projects/${slug}#stewardship`} className={cn(buttonVariants({ variant: "primary" }), "mt-6")}>
            {m.toProjectPage}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-16">
      <header className="mb-12 max-w-2xl">
        <Link href={`/projects/${slug}`} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-leaf-700">
          <PrevArrow className="size-4" /> {m.backToProject}
        </Link>
        <p className="mb-3 text-sm font-semibold tracking-wide text-leaf-600">{messages.newProject.editEyebrow}</p>
        <h1 className="font-display text-4xl font-semibold leading-tight text-leaf-900 sm:text-6xl">{t(project.name, locale)}</h1>
      </header>
      <ProjectWizard mode="edit" slug={slug} initialDraft={draftFromProject(project, locale)} />
    </div>
  );
}
