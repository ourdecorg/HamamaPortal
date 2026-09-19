import Link from "next/link";
import { layoutNetwork } from "@/lib/layout";
import { t } from "@/lib/locale";
import type { Connection } from "@/lib/matching";
import type { Project } from "@/types/project";

const W = 560;
const H = 470;

/**
 * The hero picture: every initiative is a node, every possible connection is a
 * thread that shifts from amber (the need) to teal (the offer). Built from the
 * real data, so the picture *is* the ecosystem. Nodes link to project pages.
 */
export function EcosystemMap({ projects, connections }: { projects: Project[]; connections: Connection[] }) {
  const edges = connections.map((c) => [c.project_a.id, c.project_b.id] as [string, string]);
  const points = layoutNetwork(
    projects.map((p) => p.id),
    edges,
    W,
    H,
  );
  const pos = new Map(points.map((p) => [p.id, p]));

  return (
    <figure className="relative">
      <div
        aria-hidden="true"
        className="absolute inset-4 -z-10 rounded-[3rem] bg-gradient-to-br from-leaf-50 via-white/40 to-link-50 blur-2xl"
      />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="מפת המרחב: מיזמים כנקודות, וחיבורים אפשריים בין צורך של מיזם אחד להצעה של מיזם אחר"
        className="h-auto w-full overflow-visible"
      >
        <defs>
          {connections.map((c, i) => {
            const a = pos.get(c.project_a.id);
            const b = pos.get(c.project_b.id);
            if (!a || !b) return null;
            return (
              <linearGradient key={c.id} id={`edge-${i}`} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
                <stop offset="0" stopColor="var(--color-need-500)" />
                <stop offset="1" stopColor="var(--color-offer-500)" />
              </linearGradient>
            );
          })}
        </defs>

        {/* threads */}
        {connections.map((c, i) => {
          const a = pos.get(c.project_a.id);
          const b = pos.get(c.project_b.id);
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const bend = (i % 2 === 0 ? 1 : -1) * 0.14;
          const qx = mx - dy * bend;
          const qy = my + dx * bend;
          return (
            <path
              key={c.id}
              d={`M${a.x} ${a.y} Q${qx} ${qy} ${b.x} ${b.y}`}
              fill="none"
              stroke={`url(#edge-${i})`}
              strokeWidth={1 + c.confidence * 1.6}
              strokeLinecap="round"
              strokeDasharray="4 7"
              opacity={0.3 + c.confidence * 0.55}
              className="animate-flow"
            />
          );
        })}

        {/* nodes */}
        {projects.map((p, i) => {
          const pt = pos.get(p.id);
          if (!pt) return null;
          const hasNeed = p.current_needs.some((n) => n.status === "open");
          const hasOffer = p.offers.length > 0;
          return (
            <Link key={p.id} href={`/projects/${p.slug}`} className="group/node outline-none">
              <g transform={`translate(${pt.x} ${pt.y})`} className="cursor-pointer">
                <circle
                  r="20"
                  className="animate-breathe fill-leaf-200/60"
                  style={{ animationDelay: `${(i % 5) * 0.6}s`, transformBox: "fill-box", transformOrigin: "center" }}
                />
                <circle r="8" className="fill-leaf-700 stroke-white transition-all group-hover/node:fill-leaf-900" strokeWidth="3" />
                {hasNeed && <circle cx="-13" cy="-12" r="4.5" className="fill-need-500 stroke-white" strokeWidth="2" />}
                {hasOffer && <circle cx="13" cy="-12" r="4.5" className="fill-offer-500 stroke-white" strokeWidth="2" />}
                <text
                  y="30"
                  textAnchor="middle"
                  className="fill-ink-2 text-[13px] font-medium transition-colors group-hover/node:fill-leaf-800 group-focus-visible/node:fill-leaf-800 max-sm:hidden"
                  style={{ paintOrder: "stroke", stroke: "var(--color-paper)", strokeWidth: 4, strokeLinejoin: "round" }}
                >
                  {t(p.name)}
                </text>
                <title>{t(p.name)}</title>
              </g>
            </Link>
          );
        })}
      </svg>

      <figcaption className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-need-500" /> צורך פתוח
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-offer-500" /> הצעה
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded-full bg-gradient-to-l from-offer-500 to-need-500" /> חיבור אפשרי
        </span>
      </figcaption>
    </figure>
  );
}
