import { cn } from "@/lib/utils";

/** The mark: a greenhouse arch with a seedling growing inside it. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("size-8", className)}>
      <path
        d="M4.5 28V15.5a11.5 11.5 0 0 1 23 0V28"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M2.5 28h27" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 27.2v-8.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 20.4c0-3.3-2.6-5.4-6.2-5.4 0 3.3 2.6 5.4 6.2 5.4Z" fill="currentColor" opacity=".9" />
      <path d="M16 18.2c0-3.3 2.6-5.4 6.2-5.4 0 3.3-2.6 5.4-6.2 5.4Z" fill="var(--color-offer-500)" />
      <circle cx="22.5" cy="8" r="1.5" fill="var(--color-need-500)" />
    </svg>
  );
}

export function Wordmark({ className, showSubtitle = true }: { className?: string; showSubtitle?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="text-leaf-700" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.65rem] font-bold tracking-tight text-leaf-900">חממה</span>
        {showSubtitle && (
          <span className="mt-1 hidden text-[0.68rem] font-medium tracking-wide text-ink-3 sm:block">
            פורטל מיזמי עתיד
          </span>
        )}
      </span>
    </span>
  );
}
