import type { Metadata } from "next";
import { Link } from "@/components/LocaleLink";
import { Check, CircleDashed, Clock, Gift, Lock, Pencil, Sparkles } from "lucide-react";
import { NextArrow } from "@/components/Arrows";
import { closeOpportunity } from "@/app/[lang]/connections/actions";
import { withdrawClaim } from "@/app/[lang]/projects/actions";
import { deleteWish, setWishStatus } from "@/app/[lang]/wishes/actions";
import { NeedBadge } from "@/components/NeedBadge";
import { DemoTag } from "@/components/ProjectCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { displayNameOf, requireUser } from "@/lib/auth";
import { discover, type DiscoveryResult } from "@/lib/discovery";
import { LOCALE_META, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/format";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { shortLabel, t } from "@/lib/locale";
import type { OpportunityRow } from "@/lib/opportunity";
import { listMyOpportunities } from "@/lib/opportunity-store";
import { getProjects } from "@/lib/projects";
import { listMyStewardships } from "@/lib/stewardship";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ACTIVITY_STATUS } from "@/lib/taxonomy";
import { discoveryContext, type WishRow } from "@/lib/wish";
import { listMyWishes } from "@/lib/wish-store";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).meta.mySpace.title, robots: { index: false } };
}

const shortDate = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleDateString(LOCALE_META[locale].dateLocale, { day: "numeric", month: "long", year: "numeric" });

function Section({ id, eyebrow, title, hint, children }: { id: string; eyebrow: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-16 first:mt-0">
      <p className="mb-2 text-sm font-semibold tracking-wide text-leaf-600">{eyebrow}</p>
      <h2 id={id} className="font-display text-3xl font-semibold text-leaf-900">
        {title}
      </h2>
      <p className="mb-8 mt-2 max-w-2xl text-ink-2">{hint}</p>
      {children}
    </section>
  );
}

function Empty({ children, href, cta }: { children: React.ReactNode; href: string; cta: string }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-line-2 bg-white/50 px-6 py-10 text-center">
      <p className="mx-auto max-w-md text-ink-2">{children}</p>
      <Link href={href} className={cn(buttonVariants({ variant: "soft", size: "sm" }), "mt-5")}>
        {cta} <NextArrow />
      </Link>
    </div>
  );
}

// ------------------------------------------------------------------ wishes ---

/** A wish is re-read against TODAY's projects, so a new need or a new project shows up here. */
async function liveMatches(wish: WishRow, projects: Project[], locale: Locale): Promise<DiscoveryResult> {
  const ctx = wish.interpretation.context;
  return discover({
    query: wish.text,
    projects,
    locale,
    context: discoveryContext({
      outcome: ctx?.outcome ?? wish.desired_outcome ?? "",
      offer: ctx?.offer ?? "",
      domain: ctx?.domain ?? "",
      scope: (ctx?.scope ?? wish.location_scope ?? "") as "" | "local" | "national" | "global" | "remote",
    }),
  });
}

async function WishCard({ wish, projects }: { wish: WishRow; projects: Project[] }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const m = messages.mySpace.wishes;
  const result = await liveMatches(wish, projects, locale);
  const matches = result.matches.slice(0, 3);

  return (
    <li className="rounded-[2rem] border border-line bg-white/80 p-6 shadow-soft sm:p-7">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-sun/25 px-2.5 py-0.5 font-semibold text-need-700">{messages.wish.status[wish.status]}</span>
        <span className="inline-flex items-center gap-1 text-ink-3">
          <Lock className="size-3" aria-hidden="true" /> {wish.visibility === "private" ? m.private : m.public}
        </span>
        <span className="text-ink-3">· {shortDate(wish.created_at, locale)}</span>
      </div>

      <p className="whitespace-pre-line font-display text-2xl leading-snug text-leaf-900">{wish.text}</p>
      {wish.desired_outcome && <p className="mt-2 text-sm leading-relaxed text-ink-2">{fmt(m.outcome, { text: wish.desired_outcome })}</p>}

      <div className="mt-6">
        <h3 className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-leaf-500" aria-hidden="true" />
          {matches.length ? m.matchesTitle : m.noMatchesTitle}
        </h3>
        {matches.length > 0 ? (
          <ul className="space-y-3">
            {matches.map(({ project }) => {
              const reasons = (result.reasons[project.id] ?? []).slice(0, 2);
              return (
                <li key={project.id} className="rounded-2xl bg-paper-2/70 p-4">
                  <Link href={`/projects/${project.slug}`} className="font-display text-lg font-semibold text-leaf-900 underline-offset-4 hover:underline">
                    {t(project.name, locale)}
                  </Link>
                  <ul className="mt-1.5 space-y-1 text-sm leading-relaxed text-ink-2">
                    {reasons.map((r) => (
                      <li key={r.kind + r.text} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-leaf-400" aria-hidden="true" />
                        {r.text}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">{m.noMatchesBody}</p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {wish.status !== "fulfilled" && (
          <form action={setWishStatus.bind(null, wish.id, "fulfilled")}>
            <Button type="submit" variant="soft" size="sm">
              <Check /> {m.fulfilled}
            </Button>
          </form>
        )}
        <form action={setWishStatus.bind(null, wish.id, "archived")}>
          <Button type="submit" variant="ghost" size="sm">
            {m.archive}
          </Button>
        </form>
        <details className="ms-auto text-sm">
          <summary className="cursor-pointer list-none rounded-full px-3 py-1.5 text-ink-3 hover:bg-paper-2 [&::-webkit-details-marker]:hidden">{m.more}</summary>
          <form action={deleteWish.bind(null, wish.id)} className="mt-2">
            <Button type="submit" variant="ghost" size="sm" className="text-need-700">
              {m.delete}
            </Button>
          </form>
        </details>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- projects ---

async function MyProjects() {
  const locale = await getLocale();
  const messages = await getMessages();
  const m = messages.mySpace.projects;
  const mine = await listMyStewardships();
  const approved = mine.filter((m) => m.status === "approved");
  const pending = mine.filter((m) => m.status === "pending");

  if (!mine.length) {
    return (
      <Empty href="/projects" cta={m.emptyCta}>
        {m.empty}
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      {approved.map(({ project, role }) => {
        const needs = project.current_needs.filter((n) => n.status !== "fulfilled");
        return (
          <article key={project.id} className="rounded-[2rem] border border-line bg-white/80 p-6 shadow-soft sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-leaf-100 px-2.5 py-0.5 font-semibold text-leaf-800">{role === "owner" ? messages.stewardship.roleOwner : messages.stewardship.roleSteward}</span>
                  <span className="rounded-full bg-paper-2 px-2.5 py-0.5 font-medium text-ink-2">{ACTIVITY_STATUS[project.status.activity_status][locale]}</span>
                  {project.portal.is_demo && <DemoTag />}
                </div>
                <h3 className="font-display text-2xl font-semibold text-leaf-900">
                  <Link href={`/projects/${project.slug}`} className="underline-offset-4 hover:underline">
                    {t(project.name, locale)}
                  </Link>
                </h3>
              </div>
              <Link href={`/projects/${project.slug}/edit`} className={buttonVariants({ variant: "primary", size: "sm" })}>
                <Pencil /> {m.edit}
              </Link>
            </div>

            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 font-sans text-sm font-semibold text-need-700">
                  <CircleDashed className="size-4" aria-hidden="true" /> {fmt(m.needs, { n: needs.length })}
                </h4>
                {needs.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {needs.map((n) => (
                      <li key={n.id}>
                        <NeedBadge need={n} variant="chip" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-3">{m.noNeeds}</p>
                )}
              </div>
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 font-sans text-sm font-semibold text-offer-700">
                  <Gift className="size-4" aria-hidden="true" /> {fmt(m.offers, { n: project.offers.length })}
                </h4>
                {project.offers.length ? (
                  <ul className="space-y-1 text-sm text-ink-2">
                    {project.offers.map((o) => (
                      <li key={o.id}>· {shortLabel(o, locale)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-3">{m.noOffers}</p>
                )}
              </div>
            </div>
          </article>
        );
      })}

      {pending.map(({ project }) => (
        <article key={project.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-line-2 bg-white/50 p-5">
          <p className="flex items-center gap-2 text-ink-2">
            <Clock className="size-4 text-ink-3" aria-hidden="true" />
            {m.pendingA}{" "}
            <Link href={`/projects/${project.slug}`} className="font-semibold text-leaf-900 underline-offset-4 hover:underline">
              {t(project.name, locale)}
            </Link>{" "}
            {m.pendingB}
          </p>
          <form action={withdrawClaim.bind(null, project.slug)}>
            <Button type="submit" variant="ghost" size="sm">
              {m.withdraw}
            </Button>
          </form>
        </article>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- connections ---

async function MyConnections({ opportunities, projects }: { opportunities: OpportunityRow[]; projects: Project[] }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const m = messages.mySpace.connections;
  if (!opportunities.length) {
    return (
      <Empty href="/connections" cta={m.emptyCta}>
        {m.empty}
      </Empty>
    );
  }
  const byId = new Map(projects.map((p) => [p.id, p]));

  return (
    <ul className="space-y-5">
      {opportunities.map((o) => {
        const source = byId.get(o.source_entity_id);
        const target = byId.get(o.target_entity_id);
        const need = source?.current_needs.find((n) => n.id === o.need_id);
        const offer = target?.offers.find((x) => x.id === o.offer_id);
        const status = messages.opportunity.status[o.status];
        const open = o.status === "interested" || o.status === "intro_requested";

        return (
          <li key={o.id} className="rounded-[2rem] border border-link-200/70 bg-white/80 p-6 shadow-soft">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-link-100 px-3 py-1 text-xs font-semibold text-link-700">{status.label}</span>
              <span className="text-xs text-ink-3">{fmt(m.updated, { date: shortDate(o.updated_at, locale) })}</span>
            </div>

            <p className="text-lg leading-relaxed text-ink">
              {source ? (
                <Link href={`/projects/${source.slug}`} className="font-display font-semibold text-leaf-900 underline-offset-4 hover:underline">
                  {t(source.name, locale)}
                </Link>
              ) : (
                m.unavailable
              )}
              {need && <span> {fmt(m.seeks, { label: shortLabel(need, locale) })}</span>}
              <span className="text-ink-3"> ⇄ </span>
              {target ? (
                <Link href={`/projects/${target.slug}`} className="font-display font-semibold text-leaf-900 underline-offset-4 hover:underline">
                  {t(target.name, locale)}
                </Link>
              ) : (
                m.unavailable
              )}
              {offer && <span> {fmt(m.offers, { label: shortLabel(offer, locale) })}</span>}
            </p>

            {o.rationale && <p className="mt-3 text-sm leading-relaxed text-ink-2">{o.rationale.split("\n")[0]}</p>}
            {o.unknowns.length > 0 && <p className="mt-2 text-xs text-ink-3">{fmt(m.unknownPrefix, { text: o.unknowns.slice(0, 3).join(" · ") })}</p>}
            <p className="mt-3 text-sm text-ink-2">{status.hint}</p>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {source && target && (
                <Link
                  href={`/connections?project=${source.slug}#${source.slug}--${target.slug}`}
                  className={buttonVariants({ variant: "link", size: "sm" })}
                >
                  {m.toConnection} <NextArrow />
                </Link>
              )}
              {open && (
                <form action={closeOpportunity.bind(null, o.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    {m.close}
                  </Button>
                </form>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// -------------------------------------------------------------------- page ---

export default async function MySpacePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const messages = await getMessages();
  const m = messages.mySpace;
  if (!isSupabaseConfigured()) {
    return (
      <div className="page-wrap pb-10 pt-16">
        <p className="mx-auto max-w-xl rounded-[2rem] border border-line bg-white/80 p-8 text-center leading-relaxed text-ink-2 shadow-soft">
          {m.unconfigured}
        </p>
      </div>
    );
  }

  const user = await requireUser("/my-space");
  const sp = await searchParams;
  const [wishes, opportunities, projects] = await Promise.all([listMyWishes(), listMyOpportunities(), getProjects()]);

  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-16">
      <header className="mb-14 max-w-3xl">
        <p className="mb-3 text-sm font-semibold tracking-wide text-leaf-600">{m.eyebrow}</p>
        <h1 className="font-display text-4xl font-semibold leading-tight text-leaf-900 sm:text-6xl">{fmt(m.hello, { name: displayNameOf(user, messages.account.fallbackName) })}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">{m.intro}</p>
        {sp.saved === "wish" && (
          <p role="status" className="mt-6 flex items-center gap-2 rounded-2xl bg-leaf-50 px-5 py-3 font-medium text-leaf-900">
            <Check className="size-4" aria-hidden="true" /> {m.wishSaved}
          </p>
        )}
      </header>

      <Section id="my-wishes" eyebrow={m.wishes.eyebrow} title={m.wishes.title} hint={m.wishes.hint}>
        {wishes.length ? (
          <ul className="space-y-6">
            {wishes.map((w) => (
              <WishCard key={w.id} wish={w} projects={projects} />
            ))}
          </ul>
        ) : (
          <Empty href="/wishes" cta={m.wishes.emptyCta}>
            {m.wishes.empty}
          </Empty>
        )}
      </Section>

      <Section id="my-projects" eyebrow={m.projects.eyebrow} title={m.projects.title} hint={m.projects.hint}>
        <MyProjects />
      </Section>

      <Section id="my-connections" eyebrow={m.connections.eyebrow} title={m.connections.title} hint={m.connections.hint}>
        <MyConnections opportunities={opportunities} projects={projects} />
      </Section>
    </div>
  );
}
