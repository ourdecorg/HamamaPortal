import Link from "next/link";
import { ArrowLeft, Plus, Sparkles } from "lucide-react";
import { ConnectionCard } from "@/components/ConnectionCard";
import { DataIssuesNotice } from "@/components/DataIssuesNotice";
import { EcosystemMap } from "@/components/EcosystemMap";
import { EcosystemPulse } from "@/components/EcosystemPulse";
import { ProjectCard } from "@/components/ProjectCard";
import { SearchBox } from "@/components/SearchBox";
import { SectionHeading } from "@/components/SectionHeading";
import { buttonVariants } from "@/components/ui/button";
import { pickDiverse } from "@/lib/matching";
import { domainInfo } from "@/lib/taxonomy";
import { getConnections, getDomains, getEcosystemStats, getProjects, getSeekingProjects } from "@/lib/projects";
import { cn } from "@/lib/utils";

const HOW_IT_WORKS = [
  { n: "1", title: "מיזמים מספרים", body: "מה הם מנסים לשנות, מה הם צריכים עכשיו ומה הם יכולים להציע." },
  { n: "2", title: "המערכת מזהה", body: "איפה צורך של אחד פוגש הצעה של אחר — ומסבירה למה." },
  { n: "3", title: "אנשים מחליטים", body: "שיחת היכרות, ניסוי משותף או פיילוט. הצעד הבא הוא שלכם." },
];

export default async function HomePage() {
  const [projects, stats, connections, seeking, domains] = await Promise.all([
    getProjects(),
    getEcosystemStats(),
    getConnections(),
    getSeekingProjects(4),
    getDomains(),
  ]);
  const featured = pickDiverse(connections, 3);

  return (
    <>
      <DataIssuesNotice />

      {/* A. HERO ─────────────────────────────────────────────── */}
      <section className="page-wrap pb-14 pt-10 sm:pt-14 lg:pb-20 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.12fr_1fr] lg:gap-10">
          <div className="animate-rise">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-leaf-200 bg-leaf-50/80 px-3.5 py-1.5 text-sm font-medium text-leaf-800">
              <Sparkles className="size-3.5" aria-hidden="true" />
              פורטל מיזמי עתיד
              <span className="text-leaf-800/40">·</span>
              <span dir="ltr" className="text-leaf-800/80">Future Initiatives Portal</span>
            </p>

            <h1 className="font-display text-[2.9rem] font-semibold leading-[1.05] text-leaf-900 sm:text-[4.4rem] lg:text-[4.9rem]">
              מה היית רוצה
              <br />
              <span className="relative inline-block">
                שיקרה
                <svg
                  aria-hidden="true"
                  viewBox="0 0 220 14"
                  preserveAspectRatio="none"
                  className="absolute -bottom-1 start-0 h-3 w-full text-need-400/70"
                >
                  <path d="M3 9 C 40 2, 90 13, 140 6 S 200 4, 217 8" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                </svg>
              </span>{" "}
              בעולם?
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">
              חממה מחברת בין <strong className="font-semibold text-ink">רעיונות, מיזמים, צרכים, יכולות ואנשים</strong>.
              ספרו מה אתם רוצים לראות בעולם — ונראה מי כבר בדרך, מה הם צריכים, ומה אפשר לעשות יחד.
            </p>

            <SearchBox className="mt-9 max-w-2xl" />

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/projects" className={buttonVariants({ variant: "secondary", size: "md" })}>
                גלו מיזמים
              </Link>
              <Link href="/projects/new" className={buttonVariants({ variant: "secondary", size: "md" })}>
                <Plus /> הוסיפו מיזם
              </Link>
              <Link href="/wishes" className={buttonVariants({ variant: "secondary", size: "md" })}>
                הביעו משאלה
              </Link>
            </div>
          </div>

          <div className="animate-rise [animation-delay:150ms] lg:pe-2">
            <EcosystemMap projects={projects} connections={connections} />
          </div>
        </div>
      </section>

      {/* how it works — one glance */}
      <section aria-label="איך זה עובד" className="page-wrap pb-16">
        <ol className="grid gap-6 border-y border-line-2/80 py-7 sm:grid-cols-3 sm:gap-0">
          {HOW_IT_WORKS.map((s, i) => (
            <li key={s.n} className={cn("flex gap-4 sm:px-6", i > 0 && "sm:border-s sm:border-line-2/80", i === 0 && "sm:ps-0")}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-leaf-100 font-display text-sm font-semibold text-leaf-800">
                {s.n}
              </span>
              <span>
                <span className="block font-semibold text-ink">{s.title}</span>
                <span className="text-sm leading-snug text-ink-2">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* B. ECOSYSTEM PULSE ─────────────────────────────────── */}
      <EcosystemPulse stats={stats} className="pb-24" />

      {/* C. PROJECTS SEEKING COLLABORATION ──────────────────── */}
      <section className="page-wrap pb-28" aria-labelledby="seeking-title">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            id="seeking-title"
            className="mb-0"
            eyebrow="מחפשים שותפים"
            title="מיזמים שמחכים לשיחה"
            description="מיזמים עם צרכים פתוחים וברורים. אולי יש לכם את מה שהם מחפשים — או מישהו שאתם מכירים."
          />
          <Link href="/projects?exchange=needs" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            כל המיזמים עם צרכים פתוחים <ArrowLeft />
          </Link>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {seeking.map((p) => (
            <ProjectCard key={p.id} project={p} variant="seeking" />
          ))}
        </div>
      </section>

      {/* D. CONNECTIONS — the intelligence layer ────────────── */}
      <section className="relative pb-28" aria-labelledby="connections-title">
        <div aria-hidden="true" className="absolute inset-x-0 -top-10 bottom-16 -z-10 bg-gradient-to-b from-transparent via-link-50/70 to-transparent" />
        <div className="page-wrap">
          <SectionHeading
            id="connections-title"
            eyebrow="שכבת הבנה מעל המרחב"
            title="חיבורים שהמערכת מזהה"
            description="חממה לא רק מציגה מיזמים. היא מחפשת איפה צורך של אחד פוגש הצעה של אחר — ותמיד אומרת למה, ומה עדיין לא ידוע."
          />
          <div className="space-y-7">
            {featured.map((c) => (
              <ConnectionCard key={c.id} connection={c} variant="compact" />
            ))}
          </div>
          <div className="mt-8 flex justify-center">
            <Link href="/connections" className={buttonVariants({ variant: "secondary", size: "md" })}>
              כל {connections.length} החיבורים האפשריים <ArrowLeft />
            </Link>
          </div>
        </div>
      </section>

      {/* E. EXPLORE BY DOMAIN ───────────────────────────────── */}
      <section className="page-wrap pb-28" aria-labelledby="domains-title">
        <SectionHeading
          id="domains-title"
          eyebrow="לפי נושא"
          title="לגלות לפי תחום"
          description="כל תחום הוא פתח אחר לאותו מרחב. בחרו מה קרוב אליכם."
        />
        <ul className="grid gap-x-12 sm:grid-cols-2 lg:grid-cols-3">
          {domains.map((d) => {
            const info = domainInfo(d.key);
            return (
              <li key={d.key} className="border-t border-line-2">
                <Link href={`/projects?domain=${d.key}`} className="group flex items-center gap-4 py-5">
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full transition-transform duration-300 group-hover:scale-150"
                    style={{ backgroundColor: `hsl(${info.hue} 48% 52%)` }}
                  />
                  <span className="flex-1">
                    <span className="block font-display text-[1.45rem] font-semibold leading-tight text-leaf-900 transition-colors group-hover:text-leaf-600">
                      {info.he}
                    </span>
                    <span className="block text-sm text-ink-3">{info.blurb}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-ink-3">
                    {d.count} {d.count === 1 ? "מיזם" : "מיזמים"}
                    <ArrowLeft className="size-4 opacity-0 transition-all duration-300 group-hover:-translate-x-1 group-hover:opacity-100" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* F. WISH WELL PREVIEW ───────────────────────────────── */}
      <section className="page-wrap" aria-labelledby="wish-title">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-leaf-900 px-7 py-14 text-white sm:px-14 sm:py-20">
          {/* the well: quiet ripples */}
          <div aria-hidden="true" className="pointer-events-none absolute -start-24 top-1/2 -translate-y-1/2">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="absolute rounded-full border border-white/10"
                style={{
                  width: 200 + i * 130,
                  height: 200 + i * 130,
                  top: -(100 + i * 65),
                  insetInlineStart: -(100 + i * 65),
                }}
              />
            ))}
            <span className="absolute -top-4 -start-4 size-8 animate-breathe rounded-full bg-sun/80 blur-[2px]" />
          </div>
          <div aria-hidden="true" className="absolute -end-20 -top-20 size-80 rounded-full bg-offer-500/20 blur-3xl" />

          <div className="relative max-w-xl sm:ms-auto">
            <h2 id="wish-title" className="font-display text-3xl font-semibold leading-tight sm:text-5xl">
              לא מצאתם את מה שחיפשתם?
            </h2>
            <p className="mt-5 whitespace-pre-line text-lg leading-relaxed text-white/80">
              {"ספרו לנו מה הייתם רוצים שיקרה.\nאולי כבר קיימים אנשים או מיזמים שמנסים ליצור בדיוק את זה."}
            </p>
            <Link
              href="/wishes"
              className={cn(
                buttonVariants({ size: "lg" }),
                "mt-8 bg-white text-leaf-900 shadow-none hover:bg-leaf-50",
              )}
            >
              הביעו משאלה <ArrowLeft />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
