import type { Metadata } from "next";
import { Link } from "@/components/LocaleLink";
import { notFound } from "next/navigation";
import { CalendarDays, ExternalLink, Globe, MapPin } from "lucide-react";
import { NextArrow, PrevArrow } from "@/components/Arrows";
import { ConnectionCard } from "@/components/ConnectionCard";
import { DomainTag } from "@/components/DomainTag";
import { NeedBadge } from "@/components/NeedBadge";
import { OfferBadge } from "@/components/OfferBadge";
import { ProjectCreatedNotice } from "@/components/ProjectCreatedNotice";
import { ProjectStewardship } from "@/components/ProjectStewardship";
import { DemoTag } from "@/components/ProjectCard";
import { StageBadge } from "@/components/StageBadge";
import { buttonVariants } from "@/components/ui/button";
import { LOCALE_META, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/format";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { t } from "@/lib/locale";
import { getProjectBySlug, getSuggestedConnections } from "@/lib/projects";
import { ACTIVITY_STATUS, GEOGRAPHY_SCOPES } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const locale = await getLocale();
  const project = await getProjectBySlug((await params).slug);
  if (!project) return { title: (await getMessages()).meta.projectNotFound };
  return { title: t(project.name, locale), description: t(project.tagline, locale) };
}

function formatDate(iso: string, locale: Locale): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(LOCALE_META[locale].dateLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}


function SectionTitle({ id, eyebrow, children }: { id: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="mb-2 text-sm font-semibold tracking-wide text-leaf-600">{eyebrow}</p>}
      <h2 id={id} className="font-display text-3xl font-semibold text-leaf-900 sm:text-4xl">
        {children}
      </h2>
    </div>
  );
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const m = (await getMessages()).project;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();
  const justCreated = (await searchParams).created === "1";
  const connections = await getSuggestedConnections(project.slug, locale);
  const openNeeds = project.current_needs.filter((n) => n.status !== "fulfilled");
  const { website, linkedin, github } = project.links;
  const links = [
    website && { href: website, label: m.website, icon: Globe },
    linkedin && { href: linkedin, label: "LinkedIn", icon: ExternalLink },
    github && { href: github, label: "GitHub", icon: ExternalLink },
  ].filter((l): l is { href: string; label: string; icon: typeof Globe } => Boolean(l));
  const geo = project.geography;
  // Long-form visions (several paragraphs) read better at body size than as a pull-quote.
  const vision = t(project.vision.future_world, locale);
  const longVision = vision.length > 420;

  return (
    <article>
      {justCreated && <ProjectCreatedNotice project={project} />}

      {/* HERO ───────────────────────────────────────────────── */}
      <header className="relative overflow-hidden border-b border-line/70">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-leaf-50/70 via-transparent to-transparent" />
        <div className="page-wrap pb-14 pt-8 sm:pb-20 sm:pt-10">
          <Link href="/projects" className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-leaf-700">
            <PrevArrow className="size-4" /> {m.allProjects}
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <StageBadge stage={project.status.lifecycle_stage} showHint />
            {project.status.activity_status !== "active" && (
              <span className="rounded-full bg-sun/25 px-2.5 py-0.5 text-xs font-medium text-need-700">
                {ACTIVITY_STATUS[project.status.activity_status][locale]}
              </span>
            )}
            {geo && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-2">
                <MapPin className="size-3.5" aria-hidden="true" />
                {GEOGRAPHY_SCOPES[geo.scope][locale]}
                {geo.place && ` · ${t(geo.place, locale)}`}
              </span>
            )}
            {project.portal.is_demo && <DemoTag />}
          </div>

          <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] text-leaf-900 sm:text-7xl">{t(project.name, locale)}</h1>
          <p className="mt-5 max-w-3xl font-display text-2xl leading-snug text-ink sm:text-[1.9rem]">{t(project.tagline, locale)}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            {project.domains.map((d) => (
              <DomainTag key={d} domain={d} size="md" linked />
            ))}
          </div>

          <div className="mt-9 flex flex-wrap gap-3">
            <a href="#needs" className={buttonVariants({ variant: "primary", size: "md" })}>
              {m.needsNow}
            </a>
            <a href="#connections" className={buttonVariants({ variant: "secondary", size: "md" })}>
              {m.whereConnections}

              {connections.length > 0 && (
                <span className="grid size-5 place-items-center rounded-full bg-link-100 text-[0.7rem] text-link-700">
                  {connections.length}
                </span>
              )}
            </a>
          </div>
        </div>
      </header>

      {/* WHY THE PROJECT EXISTS ─────────────────────────────── */}
      <section aria-labelledby="why" className="page-wrap py-16 sm:py-24">
        <SectionTitle id="why" eyebrow={m.storyEyebrow}>
          {m.whyTitle}
        </SectionTitle>
        <p className="mb-14 max-w-3xl text-xl leading-relaxed text-ink-2">{t(project.short_description, locale)}</p>

        <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
          <blockquote className="relative">
            <p className="mb-3 text-sm font-semibold tracking-wide text-leaf-600">{m.futureWorld}</p>
            <p
              className={cn(
                "whitespace-pre-line font-display font-medium text-leaf-900",
                longVision ? "text-xl leading-[1.75] sm:text-2xl sm:leading-[1.7]" : "text-3xl leading-snug sm:text-[2.35rem] sm:leading-[1.25]",
              )}
            >
              {vision}
            </p>
          </blockquote>

          <div className="space-y-9 border-s-2 border-line-2 ps-8">
            <div>
              <p className="mb-2 text-sm font-semibold tracking-wide text-need-700">{m.problem}</p>
              <p className="whitespace-pre-line leading-relaxed text-ink">{t(project.problem_space.primary_problem, locale)}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold tracking-wide text-offer-700">{m.change}</p>
              <p className="whitespace-pre-line leading-relaxed text-ink">{t(project.desired_change, locale)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* NEEDS + OFFERS ─────────────────────────────────────── */}
      <section className="border-y border-line/70 bg-paper-2/60">
        <div className="page-wrap grid gap-16 py-16 sm:py-24 lg:grid-cols-2 lg:gap-14">
          <div id="needs" aria-labelledby="needs-title" className="scroll-mt-header">
            <SectionTitle id="needs-title" eyebrow={m.needsEyebrow}>
              {m.needsTitle}
            </SectionTitle>
            {openNeeds.length ? (
              <ul className="space-y-4">
                {openNeeds.map((n) => (
                  <li key={n.id}>
                    <NeedBadge need={n} showDescription className="p-5" />
                    {n.status !== "open" && (
                      <p className="mt-1.5 ps-2 text-xs text-ink-3">{fmt(m.needStatusLabel, { status: m.needStatus[n.status] })}</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-line-2 p-6 text-ink-2">
                {m.noNeeds}
              </p>
            )}
          </div>

          <div id="offers" aria-labelledby="offers-title" className="scroll-mt-header">
            <SectionTitle id="offers-title" eyebrow={m.offersEyebrow}>
              {m.offersTitle}
            </SectionTitle>
            {project.offers.length ? (
              <ul className="space-y-4">
                {project.offers.map((o) => (
                  <li key={o.id}>
                    <OfferBadge offer={o} showDescription className="p-5" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-line-2 p-6 text-ink-2">
                {m.noOffers}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* CONNECTIONS ────────────────────────────────────────── */}
      <section id="connections" aria-labelledby="conn-title" className="page-wrap scroll-mt-header py-16 sm:py-24">
        <SectionTitle id="conn-title" eyebrow={m.connEyebrow}>
          {m.connTitle}
        </SectionTitle>
        <p className="-mt-3 mb-10 max-w-2xl text-lg leading-relaxed text-ink-2">{m.connBody}</p>

        {connections.length > 0 ? (
          <div className="space-y-7">
            {connections.slice(0, 4).map((c) => (
              <ConnectionCard key={c.id} connection={c} variant="full" perspectiveId={project.id} />
            ))}
            {connections.length > 4 && (
              <div className="flex justify-center">
                <Link href={`/connections?project=${project.slug}`} className={buttonVariants({ variant: "secondary" })}>
                  {fmt(m.allConnections, { n: connections.length, name: t(project.name, locale) })} <NextArrow />
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-line-2 bg-white/50 p-10 text-center">
            <h3 className="font-display text-2xl font-semibold text-leaf-900">{m.noConnTitle}</h3>
            <p className="mx-auto mt-2 max-w-lg text-ink-2">{m.noConnBody}</p>
            <Link href="/connections" className={cn(buttonVariants({ variant: "soft" }), "mt-6")}>
              {m.otherConnections}

            </Link>
          </div>
        )}
      </section>

      {/* PEOPLE · LINKS · UPDATED ───────────────────────────── */}
      <section aria-label={m.peopleAria} className="page-wrap pb-6">
        <div className="grid gap-10 border-t border-line-2 pt-12 md:grid-cols-3">
          <div>
            <h2 className="mb-4 font-sans text-sm font-semibold tracking-wide text-ink-3">{m.stewards}</h2>
            {project.people.stewards.length ? (
              <ul className="space-y-4">
                {project.people.stewards.map((s) => (
                  <li key={s.name} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="grid size-11 place-items-center rounded-full bg-leaf-100 font-display text-lg font-semibold text-leaf-800"
                    >
                      {s.name.trim()[0]}
                    </span>
                    <span>
                      <span className="block font-medium text-ink">{s.name}</span>
                      {s.role && <span className="text-sm text-ink-2">{t(s.role, locale)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">{m.noStewards}</p>
            )}
            <ProjectStewardship project={project} />
          </div>

          <div>
            <h2 className="mb-4 font-sans text-sm font-semibold tracking-wide text-ink-3">{m.links}</h2>
            {links.length ? (
              <ul className="space-y-2.5">
                {links.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-ink-2 underline-offset-4 hover:text-leaf-700 hover:underline"
                    >
                      <l.icon className="size-4" aria-hidden="true" />
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">{m.noLinks}</p>
            )}
          </div>

          <div>
            <h2 className="mb-4 font-sans text-sm font-semibold tracking-wide text-ink-3">{m.lastUpdated}</h2>
            <p className="flex items-center gap-2 text-ink-2">
              <CalendarDays className="size-4" aria-hidden="true" />
              {formatDate(project.portal.last_updated, locale)}
            </p>
            {project.portal.is_demo && (
              <p className="mt-4 rounded-2xl bg-paper-2 p-3.5 text-xs leading-relaxed text-ink-2">
                {m.demoNote}
              </p>
            )}
          </div>
        </div>
      </section>
    </article>
  );
}
