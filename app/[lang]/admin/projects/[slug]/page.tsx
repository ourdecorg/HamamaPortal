import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { PrevArrow } from "@/components/Arrows";
import { AdminProjectPanel } from "@/components/admin/AdminProjectPanel";
import { Link } from "@/components/LocaleLink";
import { ProjectWizard } from "@/components/ProjectWizard";
import { buttonVariants } from "@/components/ui/button";
import { getProjectForAdmin, requireAdminPage } from "@/lib/admin";
import { LOCALE_META } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { t } from "@/lib/locale";
import { draftFromProject } from "@/lib/wizard";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.project.eyebrow };
}

/**
 * One project, as an admin sees it: publication state, delete / restore, and the same edit wizard stewards use
 * (both languages, automatic translation). Saving goes through the stewards' save action, which also accepts
 * active admins — and Row Level Security lets admins write any project's content.
 */
export default async function AdminProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireAdminPage(`/admin/projects/${slug}`);
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const m = messages.admin.project;

  const found = await getProjectForAdmin(slug);
  if (!found) notFound();
  const { project: p, deletedAt } = found;
  const shown = !deletedAt && p.portal.review_status === "published" && p.portal.visibility !== "private";
  const deletedOn = deletedAt
    ? new Date(deletedAt).toLocaleString(LOCALE_META[locale].dateLocale, { dateStyle: "long", timeStyle: "short" })
    : null;

  return (
    <>
      <header className="mb-10">
        <Link href="/admin/projects" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-leaf-700">
          <PrevArrow className="size-4" /> {m.back}
        </Link>
        <p className="mb-3 text-sm font-semibold tracking-wide text-leaf-600">{m.eyebrow}</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold leading-tight text-leaf-900 sm:text-5xl">{t(p.name, locale)}</h1>
            <code dir="ltr" className="mt-2 block font-mono text-sm text-ink-3">
              /projects/{p.slug}
            </code>
          </div>
          {shown && (
            <Link href={`/projects/${p.slug}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              <ExternalLink /> {m.viewPublic}
            </Link>
          )}
        </div>
      </header>

      <AdminProjectPanel
        projectId={p.id}
        slug={p.slug}
        name={t(p.name, locale)}
        review={p.portal.review_status}
        visibility={p.portal.visibility}
        deletedOn={deletedOn}
      />

      <section aria-labelledby="content-title" className="mt-16">
        <h2 id="content-title" className="font-display text-3xl font-semibold text-leaf-900">
          {m.editTitle}
        </h2>
        <p className="mb-10 mt-2 max-w-2xl text-ink-2">{m.editBody}</p>
        <ProjectWizard mode="edit" slug={p.slug} doneHref="/admin/projects" initialDraft={draftFromProject(p, locale)} />
      </section>
    </>
  );
}
