import type { Metadata } from "next";
import { ExternalLink, Search, Settings2 } from "lucide-react";
import { Link } from "@/components/LocaleLink";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { listAllProjects, requireAdminPage, type AdminProject } from "@/lib/admin";
import { LOCALE_META, type Locale } from "@/lib/i18n/config";
import { plural } from "@/lib/i18n/format";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { allVariants, t } from "@/lib/locale";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.nav.projects };
}

const REVIEW = ["published", "pending_review", "draft"] as const;
const VISIBILITY = ["public", "unlisted", "private"] as const;
const SHOW = ["active", "deleted", "all"] as const;

type Search = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pick = <T extends string>(value: string, allowed: readonly T[], fallback: T | "all"): T | "all" =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

/** Everything people could search an initiative by, in every language. */
function haystack({ project: p }: AdminProject): string {
  return [
    p.slug,
    ...allVariants(p.name),
    ...allVariants(p.tagline),
    ...allVariants(p.short_description),
  ]
    .join("\n")
    .toLowerCase();
}

const isShown = ({ project: p, deletedAt }: AdminProject) =>
  !deletedAt && p.portal.review_status === "published" && p.portal.visibility !== "private";

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const tones = {
    neutral: "border-line-2 bg-paper-2 text-ink-2",
    good: "border-leaf-200 bg-leaf-50 text-leaf-800",
    warn: "border-offer-200 bg-offer-50 text-offer-700",
    bad: "border-need-200 bg-need-50 text-need-700",
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

const shortDate = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleDateString(LOCALE_META[locale].dateLocale, { day: "numeric", month: "short", year: "numeric" });

export default async function AdminProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdminPage("/admin/projects");
  const [sp, locale, messages] = await Promise.all([searchParams, getLocale(), getMessages()]);
  const m = messages.admin.projects;

  const q = one(sp.q).trim().slice(0, 200);
  const review = pick(one(sp.review), REVIEW, "all");
  const visibility = pick(one(sp.vis), VISIBILITY, "all");
  const show = pick(one(sp.show), SHOW, "active") as (typeof SHOW)[number];

  const needle = q.toLowerCase();
  const all = await listAllProjects();
  const projects = all.filter((item) => {
    const p = item.project;
    if (show === "active" && item.deletedAt) return false;
    if (show === "deleted" && !item.deletedAt) return false;
    if (review !== "all" && p.portal.review_status !== review) return false;
    if (visibility !== "all" && p.portal.visibility !== visibility) return false;
    return !needle || haystack(item).includes(needle);
  });
  const filtered = Boolean(q) || review !== "all" || visibility !== "all" || show !== "active";

  return (
    <>
      <header className="mb-8 max-w-2xl">
        <h1 className="font-display text-4xl font-semibold leading-tight text-leaf-900 sm:text-5xl">{m.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">{m.body}</p>
      </header>

      {/* Search and filters: a plain GET form, so the URL can be shared and it works without JavaScript. */}
      <form role="search" className="mb-8 grid gap-4 rounded-3xl border border-line bg-white/70 p-5 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] md:items-end">
        <div>
          <Label htmlFor="q">{m.searchLabel}</Label>
          <Input id="q" name="q" type="search" defaultValue={q} placeholder={m.searchPh} />
        </div>
        <div>
          <Label htmlFor="review">{m.review}</Label>
          <Select id="review" name="review" defaultValue={review}>
            <option value="all">{m.all}</option>
            {REVIEW.map((r) => (
              <option key={r} value={r}>
                {m.reviewStatus[r]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="vis">{m.visibility}</Label>
          <Select id="vis" name="vis" defaultValue={visibility}>
            <option value="all">{m.all}</option>
            {VISIBILITY.map((v) => (
              <option key={v} value={v}>
                {m.visibilityStatus[v]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="show">{m.show}</Label>
          <Select id="show" name="show" defaultValue={show}>
            <option value="active">{m.showActive}</option>
            <option value="deleted">{m.showDeleted}</option>
            <option value="all">{m.showAll}</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="lg" className="h-12">
            <Search /> {m.search}
          </Button>
          {filtered && (
            <Link href="/admin/projects" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-12")}>
              {m.clear}
            </Link>
          )}
        </div>
      </form>

      <p role="status" className="mb-4 text-sm font-medium text-ink-2">
        {plural(m.count, projects.length)}
      </p>

      {projects.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line-2 px-6 py-10 text-center text-ink-2">{m.empty}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white/70">
          {projects.map((item) => {
            const p = item.project;
            const other: Locale = locale === "he" ? "en" : "he";
            const otherName = p.name.translations[other]?.trim();
            return (
              <li key={p.id} className={cn("grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center", item.deletedAt && "bg-paper-2/60")}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-semibold text-leaf-900">{t(p.name, locale)}</span>
                    {otherName && otherName !== t(p.name, locale) && (
                      <span dir={LOCALE_META[other].dir} lang={other} className="text-sm text-ink-3">
                        {otherName}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-3">
                    <code dir="ltr" className="font-mono text-xs text-ink-2">
                      /{p.slug}
                    </code>
                    {item.deletedAt ? (
                      <Badge tone="bad">{m.deletedTag}</Badge>
                    ) : (
                      <>
                        <Badge tone={p.portal.review_status === "published" ? "good" : "warn"}>{m.reviewStatus[p.portal.review_status]}</Badge>
                        <Badge tone={p.portal.visibility === "private" ? "warn" : "neutral"}>{m.visibilityStatus[p.portal.visibility]}</Badge>
                      </>
                    )}
                    {p.portal.is_demo && <Badge>{messages.common.demoTag}</Badge>}
                    <span>
                      {m.colUpdated}: {shortDate(p.portal.last_updated, locale)}
                    </span>
                    <span>
                      {m.colItems}: {p.current_needs.length} · {p.offers.length}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {isShown(item) && (
                    <Link href={`/projects/${p.slug}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                      <ExternalLink /> {m.view}
                    </Link>
                  )}
                  <Link href={`/admin/projects/${p.slug}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
                    <Settings2 /> {m.manage}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
