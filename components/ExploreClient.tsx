"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, Sprout, X } from "lucide-react";
import { ProjectCard } from "@/components/ProjectCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { filterProjects, type ProjectFilters } from "@/lib/search";
import { LIFECYCLE_STAGES, STAGE_ORDER, domainInfo } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import type { LifecycleStage, Project } from "@/types/project";

type Exchange = NonNullable<ProjectFilters["exchange"]>;

export interface ExploreInitial {
  q: string;
  domains: string[];
  stage: LifecycleStage | null;
  exchange: Exchange;
}

const EXCHANGE_OPTIONS: { value: Exchange; label: string; hint: string }[] = [
  { value: "any", label: "הכול", hint: "" },
  { value: "needs", label: "מחפשים משהו", hint: "יש להם Need פתוח" },
  { value: "offers", label: "מציעים משהו", hint: "יש להם Offer" },
];

function Chip({
  active,
  onClick,
  children,
  tone = "leaf",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "leaf" | "need" | "offer";
}) {
  const activeStyles = {
    leaf: "border-leaf-600 bg-leaf-700 text-white",
    need: "border-need-500 bg-need-500 text-white",
    offer: "border-offer-500 bg-offer-500 text-white",
  }[tone];
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all",
        active ? activeStyles : "border-line-2 bg-white/70 text-ink-2 hover:border-leaf-300 hover:bg-white hover:text-leaf-800",
      )}
    >
      {children}
    </button>
  );
}

export function ExploreClient({
  projects,
  domains,
  initial,
}: {
  projects: Project[];
  domains: { key: string; label: string; count: number }[];
  initial: ExploreInitial;
}) {
  const [query, setQuery] = useState(initial.q);
  const [selectedDomains, setSelectedDomains] = useState<string[]>(initial.domains);
  const [stage, setStage] = useState<LifecycleStage | null>(initial.stage);
  const [exchange, setExchange] = useState<Exchange>(initial.exchange);

  const hits = useMemo(
    () => filterProjects(projects, { query, domains: selectedDomains, stage, exchange }),
    [projects, query, selectedDomains, stage, exchange],
  );

  const hasFilters = Boolean(query.trim() || selectedDomains.length || stage || exchange !== "any");

  // Keep the URL shareable without triggering navigation.
  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (selectedDomains.length) params.set("domain", selectedDomains.join(","));
    if (stage) params.set("stage", stage);
    if (exchange !== "any") params.set("exchange", exchange);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [query, selectedDomains, stage, exchange]);

  function toggleDomain(key: string) {
    setSelectedDomains((cur) => (cur.includes(key) ? cur.filter((d) => d !== key) : [...cur, key]));
  }

  function reset() {
    setQuery("");
    setSelectedDomains([]);
    setStage(null);
    setExchange("any");
  }

  return (
    <div>
      {/* search */}
      <div className="relative">
        <Search className="pointer-events-none absolute start-5 top-1/2 size-5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חפשו לפי שם, נושא, צורך או הצעה…"
          aria-label="חיפוש מיזמים"
          className="h-14 w-full rounded-full border border-line-2 bg-white pe-5 text-lg text-ink shadow-soft placeholder:text-ink-3/80 focus:border-leaf-500 focus:outline-none focus:ring-4 focus:ring-leaf-200/60"
          style={{ paddingInlineStart: "3.25rem" }}
        />
      </div>

      {/* filters */}
      <div className="mt-6 space-y-5">
        <fieldset>
          <legend className="mb-2.5 text-xs font-semibold tracking-wide text-ink-3">תחום</legend>
          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <Chip key={d.key} active={selectedDomains.includes(d.key)} onClick={() => toggleDomain(d.key)}>
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: selectedDomains.includes(d.key) ? "white" : `hsl(${domainInfo(d.key).hue} 48% 52%)` }}
                />
                {d.label}
                <span className={cn("text-xs", selectedDomains.includes(d.key) ? "text-white/70" : "text-ink-3")}>{d.count}</span>
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 md:grid-cols-2">
          <fieldset>
            <legend className="mb-2.5 text-xs font-semibold tracking-wide text-ink-3">שלב</legend>
            <div className="flex flex-wrap gap-2">
              <Chip active={stage === null} onClick={() => setStage(null)}>
                כל השלבים
              </Chip>
              {STAGE_ORDER.map((s) => (
                <Chip key={s} active={stage === s} onClick={() => setStage(stage === s ? null : s)}>
                  {LIFECYCLE_STAGES[s].he}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2.5 text-xs font-semibold tracking-wide text-ink-3">Need / Offer</legend>
            <div className="flex flex-wrap gap-2">
              {EXCHANGE_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  active={exchange === o.value}
                  tone={o.value === "needs" ? "need" : o.value === "offers" ? "offer" : "leaf"}
                  onClick={() => setExchange(o.value)}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      {/* results header */}
      <div className="mb-6 mt-9 flex items-center justify-between gap-4 border-t border-line-2 pt-6">
        <p aria-live="polite" className="text-sm font-medium text-ink-2">
          {hits.length === projects.length && !hasFilters
            ? `${hits.length} מיזמים במרחב`
            : `נמצאו ${hits.length} מתוך ${projects.length} מיזמים`}
        </p>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <X /> ניקוי הסינון
          </Button>
        )}
      </div>

      {/* results */}
      {hits.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {hits.map((h) => (
            <ProjectCard key={h.project.id} project={h.project} matchedFields={h.matched_fields} />
          ))}
        </div>
      ) : (
        <div className="rounded-[2rem] border border-dashed border-line-2 bg-white/50 px-6 py-16 text-center">
          <span className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-leaf-50 text-leaf-600">
            <Sprout className="size-7" aria-hidden="true" />
          </span>
          <h2 className="font-display text-2xl font-semibold text-leaf-900">עדיין אין כאן מיזם כזה</h2>
          <p className="mx-auto mt-2 max-w-md text-ink-2">
            אולי המילים שונות מאלה שהמיזמים בחרו, ואולי זה פשוט לא קיים עדיין. אפשר לרחב את הסינון, לנסות גילוי בשפה חופשית — או לספר לנו מה חסר.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button variant="secondary" onClick={reset}>
              ניקוי הסינון
            </Button>
            <Link
              href={query.trim() ? `/discover?q=${encodeURIComponent(query.trim())}` : "/discover"}
              className={buttonVariants({ variant: "soft" })}
            >
              נסו גילוי בשפה חופשית <ArrowLeft />
            </Link>
            <Link
              href={query.trim() ? `/wishes?q=${encodeURIComponent(query.trim())}` : "/wishes"}
              className={buttonVariants({ variant: "soft" })}
            >
              הביעו משאלה
            </Link>
          </div>
        </div>
      )}

      {query.trim() && hits.length > 0 && (
        <p className="mt-8 text-sm text-ink-3">
          החיפוש כאן מבוסס על מילים — הוא עדיין לא &quot;מבין&quot; משמעות.{" "}
          <Link href={`/discover?q=${encodeURIComponent(query.trim())}`} className="text-leaf-700 underline underline-offset-4">
            נסו לנסח כמשפט בגילוי
          </Link>
          .
        </p>
      )}
    </div>
  );
}
