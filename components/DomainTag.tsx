import Link from "next/link";
import { domainInfo } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

interface DomainTagProps {
  domain: string;
  size?: "sm" | "md";
  /** Render as a link to the filtered explore page. */
  linked?: boolean;
  count?: number;
  className?: string;
}

/** A domain pill with a quiet colored dot — the dot is the only color, so rows of tags stay calm. */
export function DomainTag({ domain, size = "sm", linked = false, count, className }: DomainTagProps) {
  const info = domainInfo(domain);
  const classes = cn(
    "inline-flex items-center gap-1.5 rounded-full border border-line bg-white/70 font-medium text-ink-2",
    size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3.5 py-1.5 text-sm",
    linked && "transition-all hover:-translate-y-0.5 hover:border-leaf-300 hover:bg-white hover:text-leaf-800 hover:shadow-soft",
    className,
  );
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn("rounded-full", size === "sm" ? "size-1.5" : "size-2")}
        style={{ backgroundColor: `hsl(${info.hue} 48% 52%)` }}
      />
      {info.he}
      {typeof count === "number" && <span className="text-ink-3">{count}</span>}
    </>
  );
  return linked ? (
    <Link href={`/projects?domain=${domain}`} className={classes}>
      {content}
    </Link>
  ) : (
    <span className={classes}>{content}</span>
  );
}
