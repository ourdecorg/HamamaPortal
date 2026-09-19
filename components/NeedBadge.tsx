import { CircleDashed } from "lucide-react";
import { TypeIcon } from "@/components/TypeIcon";
import { shortLabel, t } from "@/lib/locale";
import { exchangeType } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import type { Need } from "@/types/project";

interface NeedBadgeProps {
  need: Pick<Need, "type" | "title" | "description">;
  /** "chip": one line. "block": label + title (+ description). */
  variant?: "chip" | "block";
  showDescription?: boolean;
  className?: string;
}

/**
 * A NEED: warm amber, dashed outline — an open gap, something reaching out.
 * (Its sibling, OfferBadge, is teal and solid — something ready to give.)
 */
export function NeedBadge({ need, variant = "block", showDescription = false, className }: NeedBadgeProps) {
  const type = exchangeType(need.type);
  const title = shortLabel(need);

  if (variant === "chip") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-dashed border-need-400/70 bg-need-50 px-3 py-1 text-xs font-medium text-need-700",
          className,
        )}
      >
        <CircleDashed className="size-3.5" aria-hidden="true" />
        <span>Need</span>
        <span className="text-need-700/50">·</span>
        <span className="max-w-[16rem] truncate">{title}</span>
      </span>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-dashed border-need-400/70 bg-need-50/80 p-4", className)}>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-need-700">
        <span className="inline-flex items-center gap-1.5">
          <CircleDashed className="size-3.5" aria-hidden="true" />
          <span>צורך</span>
          <span className="text-need-700/50">·</span>
          <span dir="ltr">Need</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-need-100 px-2 py-0.5 text-[0.7rem]">
          <TypeIcon type={need.type} className="size-3" />
          {type.he}
        </span>
      </div>
      <p className="font-medium leading-snug text-ink">{title}</p>
      {showDescription && t(need.description) !== title && (
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{t(need.description)}</p>
      )}
    </div>
  );
}
