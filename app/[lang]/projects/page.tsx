import type { Metadata } from "next";
import { ExploreClient, type ExploreInitial } from "@/components/ExploreClient";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { getDomains, getProjects } from "@/lib/projects";
import { STAGE_ORDER } from "@/lib/taxonomy";
import type { LifecycleStage } from "@/types/project";

export async function generateMetadata(): Promise<Metadata> {
  return (await getMessages()).meta.projects;
}

type Search = { [key: string]: string | string[] | undefined };

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const m = (await getMessages()).explore;
  const [projects, domains] = await Promise.all([getProjects(), getDomains(await getLocale())]);

  const stage = first(sp.stage) as LifecycleStage;
  const exchange = first(sp.exchange);
  const known = new Set(domains.map((d) => d.key));

  const initial: ExploreInitial = {
    q: first(sp.q),
    domains: first(sp.domain)
      .split(",")
      .filter((d) => known.has(d)),
    stage: STAGE_ORDER.includes(stage) ? stage : null,
    exchange: exchange === "needs" || exchange === "offers" ? exchange : "any",
  };

  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-16">
      <header className="mb-10 max-w-2xl">
        <p className="mb-3 text-sm font-semibold tracking-wide text-leaf-600">{m.eyebrow}</p>
        <h1 className="font-display text-4xl font-semibold leading-tight text-leaf-900 sm:text-6xl">{m.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">{m.body}</p>
      </header>

      <ExploreClient projects={projects} domains={domains} initial={initial} />
    </div>
  );
}
