import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Arrows that follow the reading direction: "forward" points left in Hebrew (RTL) and right in English
 * (LTR); "back" is the opposite. Pure CSS (`ltr:` flips the icon), so they work in server and client
 * components alike. Add `rtl:group-hover:-translate-x-1 ltr:group-hover:translate-x-1` for a nudge on hover.
 */
export function NextArrow({ className }: { className?: string }) {
  return <ArrowLeft aria-hidden="true" className={cn("ltr:-scale-x-100", className)} />;
}

export function PrevArrow({ className }: { className?: string }) {
  return <ArrowRight aria-hidden="true" className={cn("ltr:-scale-x-100", className)} />;
}
