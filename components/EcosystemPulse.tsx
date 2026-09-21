import { getMessages } from "@/lib/i18n/server";
import type { EcosystemStats } from "@/lib/projects";
import { cn } from "@/lib/utils";

const ITEMS: {
  key: keyof EcosystemStats;
  text: "activeProjects" | "openNeeds" | "offers" | "possibleConnections";
  color: string;
  dot: string;
}[] = [
  { key: "active_projects", text: "activeProjects", color: "text-leaf-800", dot: "bg-leaf-500" },
  { key: "open_needs", text: "openNeeds", color: "text-need-500", dot: "bg-need-500" },
  { key: "offers", text: "offers", color: "text-offer-500", dot: "bg-offer-500" },
  { key: "possible_connections", text: "possibleConnections", color: "text-link-500", dot: "bg-link-500" },
];

/**
 * Not vanity metrics: the point is to show that something here is alive —
 * a quiet pulse next to each number, and a caption that says what it means.
 */
export async function EcosystemPulse({ stats, className }: { stats: EcosystemStats; className?: string }) {
  const m = (await getMessages()).home.pulse;
  return (
    <section aria-labelledby="pulse-title" className={cn("relative", className)}>
      <div className="page-wrap">
        <div className="mb-8 flex items-center gap-3">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-breathe rounded-full bg-leaf-500" />
            <span className="relative inline-flex size-2.5 rounded-full bg-leaf-500" />
          </span>
          <h2 id="pulse-title" className="font-sans text-sm font-semibold tracking-wide text-ink-2">
            {m.title}
          </h2>
        </div>

        <ul className="grid grid-cols-2 gap-y-10 lg:grid-cols-4">
          {ITEMS.map((item, i) => (
            <li
              key={item.key}
              className={cn(
                "relative flex flex-col ps-5",
                "border-s border-line-2",
                i % 2 === 0 && "max-lg:border-s-0 max-lg:ps-0",
                i === 0 && "lg:border-s-0 lg:ps-0",
              )}
            >
              <div className="order-1 m-0 font-display text-[3.4rem] font-bold leading-none tracking-tight sm:text-[4.2rem]">
                <span className={item.color}>{stats[item.key]}</span>
              </div>
              <div className="order-2 mt-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <span className={cn("size-2 animate-breathe rounded-full", item.dot)} style={{ animationDelay: `${i * 0.5}s` }} />
                {m[item.text].label}
              </div>
              <div className="order-3 m-0 mt-1 max-w-[15rem] text-sm leading-snug text-ink-3">{m[item.text].caption}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
