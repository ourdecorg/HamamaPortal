"use client";

import { useMessages } from "@/components/LocaleProvider";
import { signalLevel } from "@/lib/signal";
import { cn } from "@/lib/utils";

/**
 * How strong is the evidence for a connection? Three quiet bars and a word —
 * deliberately not a percentage. It is a hint; the written reasons matter more.
 */
export function SignalMeter({ confidence, className }: { confidence: number; className?: string }) {
  const m = useMessages().connectionCard;
  const level = signalLevel(confidence);
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-xs font-medium text-link-700", className)}
      title={m.signalHint}
    >
      <span className="flex items-end gap-[3px]" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("w-1 rounded-full", i <= level ? "bg-link-500" : "bg-link-200")}
            style={{ height: `${6 + i * 3}px` }}
          />
        ))}
      </span>
      {m.signal[level]}
    </span>
  );
}
