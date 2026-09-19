import Link from "next/link";
import { ArrowLeft, ArrowLeftRight, ArrowUpDown, CircleDashed, Gift, HelpCircle, Repeat2, Sparkles } from "lucide-react";
import { DemoTag } from "@/components/ProjectCard";
import { IntroDraft } from "@/components/IntroDraft";
import { SignalMeter } from "@/components/SignalMeter";
import { TypeIcon } from "@/components/TypeIcon";
import { buttonVariants } from "@/components/ui/button";
import type { Connection, ProjectRef } from "@/lib/matching";
import { exchangeType } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

interface ConnectionCardProps {
  connection: Connection;
  /** "compact": for the home page. "full": the whole story, with next steps. */
  variant?: "compact" | "full";
  /** When shown on a project page, mark which side is "this project". */
  perspectiveId?: string;
  className?: string;
}

function Side({
  role,
  project,
  item,
  full,
  isSelf,
}: {
  role: "need" | "offer";
  project: ProjectRef;
  item: Connection["need"];
  full: boolean;
  isSelf: boolean;
}) {
  const isNeed = role === "need";
  const Icon = isNeed ? CircleDashed : Gift;
  return (
    <div
      className={cn(
        "flex flex-col rounded-3xl p-5",
        isNeed
          ? "border border-dashed border-need-400/70 bg-need-50/80"
          : "border border-offer-400/50 bg-offer-50/80",
      )}
    >
      <div
        className={cn(
          "mb-3 flex items-center justify-between gap-2 text-xs font-semibold",
          isNeed ? "text-need-700" : "text-offer-700",
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <Icon className="size-3.5" aria-hidden="true" />
          {isNeed ? "מי צריך" : "מי יכול להציע"}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem]",
            isNeed ? "bg-need-100" : "bg-offer-100",
          )}
        >
          <TypeIcon type={item.type} className="size-3" />
          {exchangeType(item.type).he}
        </span>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Link
          href={`/projects/${project.slug}`}
          className="font-display text-xl font-bold leading-tight text-leaf-900 underline-offset-4 hover:underline"
        >
          {project.name}
        </Link>
        {isSelf && (
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[0.65rem] font-medium text-ink-2">המיזם הזה</span>
        )}
      </div>

      <p className="mb-1 text-xs text-ink-3">{isNeed ? "מחפש" : "מציע"}</p>
      <p className="font-medium leading-snug text-ink">{item.label}</p>
      {full && <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.description}</p>}
    </div>
  );
}

function Connector({ reciprocal }: { reciprocal: boolean }) {
  return (
    <div className="relative flex items-center justify-center py-2 lg:w-24 lg:py-0" aria-hidden="true">
      {/* the thread: vertical on small screens, horizontal on large */}
      <span className="absolute inset-y-0 start-1/2 border-s-2 border-dashed border-link-200 lg:inset-y-auto lg:start-0 lg:end-0 lg:top-1/2 lg:border-s-0 lg:border-t-2" />
      <span className="relative z-10 grid size-11 shrink-0 place-items-center rounded-full border border-link-200 bg-link-50 text-link-700 shadow-soft">
        <span className="absolute inset-0 animate-breathe rounded-full bg-link-100/70" />
        <ArrowUpDown className="relative size-[1.15rem] lg:hidden" />
        <ArrowLeftRight className="relative hidden size-[1.15rem] lg:block" />
      </span>
      {reciprocal && (
        <span className="absolute end-0 z-10 inline-flex items-center gap-1 rounded-full bg-link-100 px-2 py-0.5 text-[0.65rem] font-semibold text-link-700 lg:hidden">
          <Repeat2 className="size-3" /> הדדי
        </span>
      )}
    </div>
  );
}

export function ConnectionCard({ connection: c, variant = "full", perspectiveId, className }: ConnectionCardProps) {
  const full = variant === "full";

  return (
    <article
      id={c.id}
      className={cn(
        "connection-anchor scroll-mt-header overflow-hidden rounded-[2rem] border border-link-200/70 bg-white/80 shadow-soft",
        className,
      )}
    >
      {/* Header strip: the "signal" and what kind of connection this is */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-link-100 bg-link-50/60 px-5 py-2.5 sm:px-7">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-link-700">
          <Sparkles className="size-3.5" aria-hidden="true" />
          חיבור אפשרי
          {c.reciprocal && (
            <span className="hidden items-center gap-1 rounded-full bg-link-100 px-2 py-0.5 text-[0.65rem] lg:inline-flex">
              <Repeat2 className="size-3" /> הדדי
            </span>
          )}
          {(c.project_a.is_demo || c.project_b.is_demo) && <DemoTag />}
        </span>
        <SignalMeter confidence={c.confidence} />
      </div>

      {/* 1. WHO NEEDS WHAT ↔ WHO CAN OFFER WHAT */}
      <div className="grid items-stretch gap-0 p-5 sm:p-7 lg:grid-cols-[1fr_auto_1fr]">
        <Side role="need" project={c.project_a} item={c.need} full={full} isSelf={perspectiveId === c.project_a.id} />
        <Connector reciprocal={Boolean(c.reciprocal)} />
        <Side role="offer" project={c.project_b} item={c.offer} full={full} isSelf={perspectiveId === c.project_b.id} />
      </div>

      {/* 2. WHY THIS MAY WORK · 3. WHAT IS UNKNOWN */}
      <div className={cn("grid gap-6 border-t border-link-100 px-5 py-6 sm:px-7", full ? "md:grid-cols-[1.25fr_1fr]" : "md:grid-cols-[1.25fr_1fr]")}>
        <div>
          <h4 className="mb-2 font-sans text-sm font-semibold text-link-700">למה החיבור עשוי להיות מעניין?</h4>
          <p className="leading-relaxed text-ink">{c.summary}</p>
          {full && (
            <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
              {c.reasons.map((r) => (
                <li key={r.kind + r.text} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-link-400" aria-hidden="true" />
                  <span>
                    {r.text}
                    {r.tags?.map((tag) => (
                      <span key={tag} dir="ltr" className="ms-1.5 inline-block rounded-full bg-link-50 px-2 py-0.5 text-xs font-medium text-link-700">
                        {tag}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1.5 font-sans text-sm font-semibold text-ink-2">
            <HelpCircle className="size-4 text-ink-3" aria-hidden="true" /> מה עדיין לא ידוע
          </h4>
          {full ? (
            <ul className="space-y-1.5 text-sm text-ink-2">
              {c.unknowns.map((u) => (
                <li key={u} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-line-2" aria-hidden="true" />
                  {u}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {c.unknowns.slice(0, 3).map((u) => (
                <span key={u} className="rounded-full border border-line-2 bg-paper px-2.5 py-1 text-xs text-ink-2">
                  {u.split(" — ")[0]}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. WHAT COULD HAPPEN NEXT */}
      {full ? (
        <div className="border-t border-link-100 bg-paper/60 px-5 py-6 sm:px-7">
          <h4 className="mb-3 font-sans text-sm font-semibold text-ink">מה יכול לקרות הלאה?</h4>
          <ol className="mb-5 grid gap-3 sm:grid-cols-3">
            {c.next_steps.map((s, i) => (
              <li key={s.id} className="rounded-2xl border border-line bg-white/70 p-4">
                <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-leaf-800">
                  <span className="grid size-5 place-items-center rounded-full bg-leaf-100 text-[0.7rem]">{i + 1}</span>
                  {s.label}
                </span>
                <span className="text-sm leading-snug text-ink-2">{s.hint}</span>
              </li>
            ))}
          </ol>
          <IntroDraft connection={c} />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 border-t border-link-100 bg-paper/60 px-5 py-4 sm:px-7">
          <p className="hidden text-xs text-ink-3 sm:block">הצעה, לא הכרעה — אנשים מחליטים אם יש כאן משהו.</p>
          <Link href={`/connections#${c.id}`} className={cn(buttonVariants({ variant: "link", size: "sm" }), "ms-auto")}>
            בחינת החיבור <ArrowLeft />
          </Link>
        </div>
      )}
    </article>
  );
}
