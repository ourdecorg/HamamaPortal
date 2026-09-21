import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DomainTag } from "@/components/DomainTag";
import { NeedBadge } from "@/components/NeedBadge";
import { OfferBadge } from "@/components/OfferBadge";
import { StageBadge } from "@/components/StageBadge";
import { t } from "@/lib/locale";
import { SEARCH_FIELD_LABELS, type SearchField } from "@/lib/search";
import { ACTIVITY_STATUS } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";

interface ProjectCardProps {
  project: Project;
  /**
   * "explore": name, tagline, domains, stage, one Need, one Offer.
   * "seeking": leads with what they want to change and what they need now.
   */
  variant?: "explore" | "seeking";
  /** Where a search query matched — shown as a quiet explanation. */
  matchedFields?: SearchField[];
  className?: string;
}

export function DemoTag({ className }: { className?: string }) {
  return (
    <span
      title="תוכן לדוגמה — מיזם בדיוני שנכתב לצורך הדמו"
      className={cn(
        "inline-flex items-center rounded-full border border-line-2 bg-paper-2 px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-ink-3",
        className,
      )}
    >
      דוגמה
    </span>
  );
}

export function ProjectCard({ project, variant = "explore", matchedFields = [], className }: ProjectCardProps) {
  const openNeeds = project.current_needs.filter((n) => n.status === "open");
  const need = openNeeds[0];
  const offer = project.offers[0];
  const activity = project.status.activity_status;

  const base =
    "group relative flex h-full flex-col rounded-[1.75rem] border border-line bg-white/75 p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-leaf-200 hover:bg-white hover:shadow-lift";

  if (variant === "seeking") {
    return (
      <Link href={`/projects/${project.slug}`} className={cn(base, "gap-5", className)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl font-semibold leading-tight text-leaf-900">{t(project.name)}</h3>
            <StageBadge stage={project.status.lifecycle_stage} className="mt-2" />
          </div>
          {project.portal.is_demo && <DemoTag />}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-3">מה הם מנסים לשנות</p>
          <p className="font-display text-[1.15rem] leading-snug text-ink">{t(project.desired_change)}</p>
        </div>

        <div className="mt-auto space-y-2.5">
          <p className="text-xs font-semibold tracking-wide text-ink-3">מה הם צריכים עכשיו</p>
          {openNeeds.slice(0, 2).map((n) => (
            <NeedBadge key={n.id} need={n} />
          ))}
        </div>

        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-leaf-700">
          להכיר את המיזם
          <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" />
        </span>
      </Link>
    );
  }

  return (
    <Link href={`/projects/${project.slug}`} className={cn(base, "gap-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <StageBadge stage={project.status.lifecycle_stage} />
        <div className="flex items-center gap-2">
          {activity !== "active" && (
            <span className="rounded-full bg-sun/25 px-2 py-0.5 text-[0.65rem] font-medium text-need-700">
              {ACTIVITY_STATUS[activity].he}
            </span>
          )}
          {project.portal.is_demo && <DemoTag />}
        </div>
      </div>

      <div>
        <h3 className="font-display text-[1.6rem] font-semibold leading-tight text-leaf-900">{t(project.name)}</h3>
        <p className="mt-1.5 leading-snug text-ink-2">{t(project.tagline)}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {project.domains.map((d) => (
          <DomainTag key={d} domain={d} />
        ))}
      </div>

      {(need || offer) && (
        <div className="mt-auto grid gap-2.5 pt-1">
          {need && <NeedBadge need={need} />}
          {offer && <OfferBadge offer={offer} />}
        </div>
      )}

      {matchedFields.length > 0 && (
        <p className="text-xs text-link-700">
          נמצא {matchedFields.slice(0, 3).map((f) => SEARCH_FIELD_LABELS[f]).join(", ")}
        </p>
      )}
    </Link>
  );
}
