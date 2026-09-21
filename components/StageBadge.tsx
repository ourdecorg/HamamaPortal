"use client";

import { useLocale } from "@/components/LocaleProvider";
import { LIFECYCLE_STAGES, STAGE_ORDER } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import type { LifecycleStage } from "@/types/project";

/**
 * The lifecycle stage as a tiny growth indicator: six dots, filled up to the
 * current stage. Reads as "how far along", without pretending to be a score.
 */
export function StageBadge({
  stage,
  showHint = false,
  className,
}: {
  stage: LifecycleStage;
  showHint?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const info = LIFECYCLE_STAGES[stage];
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs font-medium text-ink-2", className)} title={info.hint[locale]}>
      <span className="flex items-center gap-[3px]" aria-hidden="true">
        {STAGE_ORDER.map((s) => (
          <span
            key={s}
            className={cn(
              "size-1.5 rounded-full",
              LIFECYCLE_STAGES[s].order <= info.order ? "bg-leaf-500" : "bg-line-2",
            )}
          />
        ))}
      </span>
      <span>
        {info[locale]}
        {showHint && <span className="ms-1.5 font-normal text-ink-3">· {info.hint[locale]}</span>}
      </span>
    </span>
  );
}
