"use client";

import { Gift } from "lucide-react";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import { TypeIcon } from "@/components/TypeIcon";
import { shortLabel, t } from "@/lib/locale";
import { exchangeType } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import type { Offer } from "@/types/project";

interface OfferBadgeProps {
  offer: Pick<Offer, "type" | "title" | "description">;
  variant?: "chip" | "block";
  showDescription?: boolean;
  className?: string;
}

/** An OFFER: fresh teal, solid outline — something ready to be given. */
export function OfferBadge({ offer, variant = "block", showDescription = false, className }: OfferBadgeProps) {
  const locale = useLocale();
  const m = useMessages().common;
  const type = exchangeType(offer.type);
  const title = shortLabel(offer, locale);

  if (variant === "chip") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-offer-400/60 bg-offer-50 px-3 py-1 text-xs font-medium text-offer-700",
          className,
        )}
      >
        <Gift className="size-3.5" aria-hidden="true" />
        <span>{m.offerChip}</span>
        <span className="text-offer-700/50">·</span>
        <span className="max-w-[16rem] truncate">{title}</span>
      </span>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-offer-400/50 bg-offer-50/80 p-4", className)}>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-offer-700">
        <span className="inline-flex items-center gap-1.5">
          <Gift className="size-3.5" aria-hidden="true" />
          <span>{m.offer}</span>
          {m.offerAlt && (
            <>
              <span className="text-offer-700/50">·</span>
              <span dir="ltr">{m.offerAlt}</span>
            </>
          )}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-offer-100 px-2 py-0.5 text-[0.7rem]">
          <TypeIcon type={offer.type} className="size-3" />
          {type[locale]}
        </span>
      </div>
      <p className="font-medium leading-snug text-ink">{title}</p>
      {showDescription && t(offer.description, locale) !== title && (
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{t(offer.description, locale)}</p>
      )}
    </div>
  );
}
