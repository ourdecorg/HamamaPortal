import type { Metadata } from "next";
import { Link } from "@/components/LocaleLink";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { Layers, Repeat2, Share2, Tags, X } from "lucide-react";
import { NextArrow } from "@/components/Arrows";
import { ConnectionCard } from "@/components/ConnectionCard";
import { plural } from "@/lib/i18n/format";
import { NeedBadge } from "@/components/NeedBadge";
import { buttonVariants } from "@/components/ui/button";
import { connectionsFor } from "@/lib/matching";
import { t } from "@/lib/locale";
import { getConnections, getProjectBySlug, getUnmetNeeds } from "@/lib/projects";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return (await getMessages()).meta.connections;
}

const SIGNAL_ICONS = [Layers, Tags, Share2, Repeat2];

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const m = (await getMessages()).connections;
  const projectSlug = typeof sp.project === "string" ? sp.project : undefined;

  const [all, unmet, focusProject] = await Promise.all([
    getConnections(locale),
    getUnmetNeeds(locale),
    projectSlug ? getProjectBySlug(projectSlug) : Promise.resolve(null),
  ]);
  const connections = focusProject ? connectionsFor(all, focusProject.id) : all;

  return (
    <div className="pb-8">
      {/* intro ───────────────────────────────────────────────── */}
      <header className="page-wrap pb-14 pt-12 sm:pt-16">
        <p className="mb-3 text-sm font-semibold tracking-wide text-link-700">{m.eyebrow}
          {m.eyebrowAlt && ` · ${m.eyebrowAlt}`}
        </p>
        <h1 className="max-w-4xl font-display text-4xl font-semibold leading-[1.1] text-leaf-900 sm:text-6xl">
          {m.titleA}
          <br />
          <span className="text-link-500">{m.titleB}</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2 sm:text-xl">
          {m.intro}
        </p>

        <ul className="mt-12 grid gap-x-8 gap-y-6 border-t border-line-2 pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {m.signals.map((s, i) => {
            const Icon = SIGNAL_ICONS[i];
            return (
            <li key={s.title} className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-link-50 text-link-700">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{s.title}</span>
                <span className="text-sm leading-snug text-ink-2">{s.body}</span>
              </span>
            </li>
            );
          })}
        </ul>

        <p className="mt-8 max-w-3xl rounded-2xl bg-paper-2/80 px-5 py-4 text-sm leading-relaxed text-ink-2">
          <strong className="font-semibold text-ink">{m.noteStrong}</strong>
          {m.note}
        </p>
      </header>

      {/* list ────────────────────────────────────────────────── */}
      <section className="page-wrap" aria-label={m.listAria}>
        {focusProject && (
          <div className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-link-200 bg-link-50/60 px-5 py-3 text-sm text-ink-2">
            {m.onlyFor} <strong className="text-ink">{t(focusProject.name, locale)}</strong>
            <Link href="/connections" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ms-auto")}>
              <X /> {m.all}
            </Link>
          </div>
        )}

        {connections.length > 0 ? (
          <>
            <p className="mb-6 text-sm font-medium text-ink-2">
              {plural(m.count, connections.length)}
            </p>
            <div className="space-y-9">
              {connections.map((c) => (
                <ConnectionCard key={c.id} connection={c} variant="full" perspectiveId={focusProject?.id} />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-line-2 bg-white/50 px-6 py-16 text-center">
            <h2 className="font-display text-2xl font-semibold text-leaf-900">{m.emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-md text-ink-2">{m.emptyBody}</p>
            <Link href="/projects/new" className={cn(buttonVariants({ variant: "soft" }), "mt-6")}>
              {m.addProject} <NextArrow />
            </Link>
          </div>
        )}
      </section>

      {/* unmet needs ─────────────────────────────────────────── */}
      {unmet.length > 0 && !focusProject && (
        <section className="page-wrap mt-24" aria-labelledby="unmet-title">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold tracking-wide text-need-700">{m.unmetEyebrow}</p>
            <h2 id="unmet-title" className="font-display text-3xl font-semibold text-leaf-900 sm:text-4xl">
              {m.unmetTitle}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-2">{m.unmetBody}</p>
          </div>

          <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {unmet.map(({ project, need }) => (
              <li key={`${project.id}-${need.id}`}>
                <Link href={`/projects/${project.slug}`} className="group block">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-leaf-900 group-hover:text-leaf-600">
                    {project.name}
                    <NextArrow className="size-3.5 opacity-0 transition-all rtl:group-hover:-translate-x-1 ltr:group-hover:translate-x-1 group-hover:opacity-100" />
                  </p>
                  <NeedBadge need={{
                      type: need.type,
                      title: { translations: { [locale]: need.label } },
                      description: { translations: { [locale]: need.description } },
                    }} />
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-10">
            <Link href="/projects/new" className={buttonVariants({ variant: "secondary" })}>
              {m.unmetCta} <NextArrow />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
