import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, CircleDashed, Clock, Gift, Lock, Pencil, Sparkles } from "lucide-react";
import { closeOpportunity } from "@/app/connections/actions";
import { withdrawClaim } from "@/app/projects/actions";
import { deleteWish, setWishStatus } from "@/app/wishes/actions";
import { NeedBadge } from "@/components/NeedBadge";
import { DemoTag } from "@/components/ProjectCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { displayNameOf, requireUser } from "@/lib/auth";
import { discover, type DiscoveryResult } from "@/lib/discovery";
import { shortLabel, t } from "@/lib/locale";
import { OPPORTUNITY_STATUS, type OpportunityRow } from "@/lib/opportunity";
import { listMyOpportunities } from "@/lib/opportunity-store";
import { getProjects } from "@/lib/projects";
import { listMyStewardships } from "@/lib/stewardship";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ACTIVITY_STATUS } from "@/lib/taxonomy";
import { discoveryContext, WISH_STATUS, type WishRow } from "@/lib/wish";
import { listMyWishes } from "@/lib/wish-store";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";

export const metadata: Metadata = {
  title: "המרחב שלי",
  robots: { index: false },
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });

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
        {cta} <ArrowLeft />
      </Link>
    </div>
  );
}

// ------------------------------------------------------------------ wishes ---

/** A wish is re-read against TODAY's projects, so a new need or a new project shows up here. */
async function liveMatches(wish: WishRow, projects: Project[]): Promise<DiscoveryResult> {
  const ctx = wish.interpretation.context;
  return discover({
    query: wish.text,
    projects,
    context: discoveryContext({
      outcome: ctx?.outcome ?? wish.desired_outcome ?? "",
      offer: ctx?.offer ?? "",
      domain: ctx?.domain ?? "",
      scope: (ctx?.scope ?? wish.location_scope ?? "") as "" | "local" | "national" | "global" | "remote",
    }),
  });
}

async function WishCard({ wish, projects }: { wish: WishRow; projects: Project[] }) {
  const result = await liveMatches(wish, projects);
  const matches = result.matches.slice(0, 3);

  return (
    <li className="rounded-[2rem] border border-line bg-white/80 p-6 shadow-soft sm:p-7">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-sun/25 px-2.5 py-0.5 font-semibold text-need-700">{WISH_STATUS[wish.status]}</span>
        <span className="inline-flex items-center gap-1 text-ink-3">
          <Lock className="size-3" aria-hidden="true" /> {wish.visibility === "private" ? "פרטית" : "ציבורית"}
        </span>
        <span className="text-ink-3">· {shortDate(wish.created_at)}</span>
      </div>

      <p className="whitespace-pre-line font-display text-2xl leading-snug text-leaf-900">{wish.text}</p>
      {wish.desired_outcome && <p className="mt-2 text-sm leading-relaxed text-ink-2">העולם שרצית לראות: {wish.desired_outcome}</p>}

      <div className="mt-6">
        <h3 className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-leaf-500" aria-hidden="true" />
          {matches.length ? "מיזמים שעשויים להתאים היום" : "עוד לא מצאנו מיזם שמתאים בבירור"}
        </h3>
        {matches.length > 0 ? (
          <ul className="space-y-3">
            {matches.map(({ project }) => {
              const reasons = (result.reasons[project.id] ?? []).slice(0, 2);
              return (
                <li key={project.id} className="rounded-2xl bg-paper-2/70 p-4">
                  <Link href={`/projects/${project.slug}`} className="font-display text-lg font-semibold text-leaf-900 underline-offset-4 hover:underline">
                    {t(project.name)}
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
          <p className="text-sm text-ink-3">זה לא אומר שהמשאלה לא חשובה. כשיצטרפו מיזמים חדשים נבדוק שוב, וכאן תראו מה השתנה.</p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {wish.status !== "fulfilled" && (
          <form action={setWishStatus.bind(null, wish.id, "fulfilled")}>
            <Button type="submit" variant="soft" size="sm">
              <Check /> התגשמה
            </Button>
          </form>
        )}
        <form action={setWishStatus.bind(null, wish.id, "archived")}>
          <Button type="submit" variant="ghost" size="sm">
            לארכיון
          </Button>
        </form>
        <details className="ms-auto text-sm">
          <summary className="cursor-pointer list-none rounded-full px-3 py-1.5 text-ink-3 hover:bg-paper-2 [&::-webkit-details-marker]:hidden">עוד</summary>
          <form action={deleteWish.bind(null, wish.id)} className="mt-2">
            <Button type="submit" variant="ghost" size="sm" className="text-need-700">
              מחיקה סופית
            </Button>
          </form>
        </details>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- projects ---

async function MyProjects() {
  const mine = await listMyStewardships();
  const approved = mine.filter((m) => m.status === "approved");
  const pending = mine.filter((m) => m.status === "pending");

  if (!mine.length) {
    return (
      <Empty href="/projects" cta="לגלות מיזמים">
        עוד לא ביקשתם לטפח מיזם. אם אתם חלק ממיזם שכבר כאן, פתחו את הדף שלו ולחצו ״אני מטפח/ת את המיזם הזה״.
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
                  <span className="rounded-full bg-leaf-100 px-2.5 py-0.5 font-semibold text-leaf-800">{role === "owner" ? "בעלים" : "מטפח/ת"}</span>
                  <span className="rounded-full bg-paper-2 px-2.5 py-0.5 font-medium text-ink-2">{ACTIVITY_STATUS[project.status.activity_status].he}</span>
                  {project.portal.is_demo && <DemoTag />}
                </div>
                <h3 className="font-display text-2xl font-semibold text-leaf-900">
                  <Link href={`/projects/${project.slug}`} className="underline-offset-4 hover:underline">
                    {t(project.name)}
                  </Link>
                </h3>
              </div>
              <Link href={`/projects/${project.slug}/edit`} className={buttonVariants({ variant: "primary", size: "sm" })}>
                <Pencil /> עריכה
              </Link>
            </div>

            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 font-sans text-sm font-semibold text-need-700">
                  <CircleDashed className="size-4" aria-hidden="true" /> צרכים ({needs.length})
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
                  <p className="text-sm text-ink-3">אין צרכים פתוחים.</p>
                )}
              </div>
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 font-sans text-sm font-semibold text-offer-700">
                  <Gift className="size-4" aria-hidden="true" /> הצעות ({project.offers.length})
                </h4>
                {project.offers.length ? (
                  <ul className="space-y-1 text-sm text-ink-2">
                    {project.offers.map((o) => (
                      <li key={o.id}>· {shortLabel(o)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-3">אין הצעות עדיין.</p>
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
            הבקשה לטפח את{" "}
            <Link href={`/projects/${project.slug}`} className="font-semibold text-leaf-900 underline-offset-4 hover:underline">
              {t(project.name)}
            </Link>{" "}
            ממתינה לאישור.
          </p>
          <form action={withdrawClaim.bind(null, project.slug)}>
            <Button type="submit" variant="ghost" size="sm">
              ביטול הבקשה
            </Button>
          </form>
        </article>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- connections ---

function MyConnections({ opportunities, projects }: { opportunities: OpportunityRow[]; projects: Project[] }) {
  if (!opportunities.length) {
    return (
      <Empty href="/connections" cta="לראות חיבורים">
        עוד לא סימנתם חיבור לקידום. בדף החיבורים לחצו ״אני רוצה לקדם את החיבור הזה״ על חיבור שמעניין אתכם.
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
        const status = OPPORTUNITY_STATUS[o.status];
        const open = o.status === "interested" || o.status === "intro_requested";

        return (
          <li key={o.id} className="rounded-[2rem] border border-link-200/70 bg-white/80 p-6 shadow-soft">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-link-100 px-3 py-1 text-xs font-semibold text-link-700">{status.label}</span>
              <span className="text-xs text-ink-3">עודכן {shortDate(o.updated_at)}</span>
            </div>

            <p className="text-lg leading-relaxed text-ink">
              {source ? (
                <Link href={`/projects/${source.slug}`} className="font-display font-semibold text-leaf-900 underline-offset-4 hover:underline">
                  {t(source.name)}
                </Link>
              ) : (
                "מיזם שאינו זמין כרגע"
              )}
              {need && <span> מחפש/ת {shortLabel(need)}</span>}
              <span className="text-ink-3"> ⇄ </span>
              {target ? (
                <Link href={`/projects/${target.slug}`} className="font-display font-semibold text-leaf-900 underline-offset-4 hover:underline">
                  {t(target.name)}
                </Link>
              ) : (
                "מיזם שאינו זמין כרגע"
              )}
              {offer && <span> מציע/ה {shortLabel(offer)}</span>}
            </p>

            {o.rationale && <p className="mt-3 text-sm leading-relaxed text-ink-2">{o.rationale.split("\n")[0]}</p>}
            {o.unknowns.length > 0 && <p className="mt-2 text-xs text-ink-3">עוד לא ידוע: {o.unknowns.slice(0, 3).join(" · ")}</p>}
            <p className="mt-3 text-sm text-ink-2">{status.hint}</p>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {source && target && (
                <Link
                  href={`/connections?project=${source.slug}#${source.slug}--${target.slug}`}
                  className={buttonVariants({ variant: "link", size: "sm" })}
                >
                  לחיבור עצמו <ArrowLeft />
                </Link>
              )}
              {open && (
                <form action={closeOpportunity.bind(null, o.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    לא מקדמים כרגע
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
  if (!isSupabaseConfigured()) {
    return (
      <div className="page-wrap pb-10 pt-16">
        <p className="mx-auto max-w-xl rounded-[2rem] border border-line bg-white/80 p-8 text-center leading-relaxed text-ink-2 shadow-soft">
          ״המרחב שלי״ זמין כשהפורטל מחובר למסד הנתונים. כרגע הוא רץ במצב הדגמה.
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
        <p className="mb-3 text-sm font-semibold tracking-wide text-leaf-600">המרחב שלי</p>
        <h1 className="font-display text-4xl font-semibold leading-tight text-leaf-900 sm:text-6xl">שלום, {displayNameOf(user)}.</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          כאן נמצא מה שביקשתם לשמור: משאלות, מיזמים שאתם מטפחים וחיבורים שאתם רוצים לקדם. הכול פרטי, אלא אם החלטתם אחרת.
        </p>
        {sp.saved === "wish" && (
          <p role="status" className="mt-6 flex items-center gap-2 rounded-2xl bg-leaf-50 px-5 py-3 font-medium text-leaf-900">
            <Check className="size-4" aria-hidden="true" /> המשאלה נשמרה.
          </p>
        )}
      </header>

      <Section id="my-wishes" eyebrow="משאלות" title="המשאלות שלי" hint="כל משאלה נבדקת שוב מול המיזמים של היום, כך שתראו מיזמים חדשים כשהם מצטרפים.">
        {wishes.length ? (
          <ul className="space-y-6">
            {wishes.map((w) => (
              <WishCard key={w.id} wish={w} projects={projects} />
            ))}
          </ul>
        ) : (
          <Empty href="/wishes" cta="להביע משאלה">
            עוד לא שמרתם משאלה. ספרו מה הייתם רוצים שיקרה, ואם תרצו — שמרו אותה כאן.
          </Empty>
        )}
      </Section>

      <Section id="my-projects" eyebrow="מיזמים" title="המיזמים שלי" hint="מיזמים שאתם מטפחים: צרכים, הצעות ועריכה.">
        <MyProjects />
      </Section>

      <Section id="my-connections" eyebrow="חיבורים" title="החיבורים שלי" hint="חיבורים שסימנתם שאתם רוצים לקדם. החממה לא פונה לאף אחד בשמכם — הצעד הבא הוא שלכם.">
        <MyConnections opportunities={opportunities} projects={projects} />
      </Section>
    </div>
  );
}
