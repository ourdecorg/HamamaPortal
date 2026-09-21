import type { Metadata } from "next";
import { Link } from "@/components/LocaleLink";
import { NextArrow } from "@/components/Arrows";
import { DiscoveryResults } from "@/components/DiscoveryResults";
import { SearchBox } from "@/components/SearchBox";
import { buttonVariants } from "@/components/ui/button";
import { discover } from "@/lib/discovery";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { getDomains, getProjects } from "@/lib/projects";
import { DomainTag } from "@/components/DomainTag";

export async function generateMetadata(): Promise<Metadata> {
  return (await getMessages()).meta.discover;
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const messages = await getMessages();
  const m = messages.discover;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 600);
  const [projects, domains] = await Promise.all([getProjects(), getDomains(locale)]);
  const result = q ? await discover({ query: q, projects, locale }) : null;

  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-16">
      <header className="mb-10 max-w-3xl">
        <p className="mb-3 text-sm font-semibold tracking-wide text-leaf-600">{m.eyebrow}</p>
        <h1 className="font-display text-4xl font-semibold leading-tight text-leaf-900 sm:text-6xl">{m.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">{m.body}</p>
      </header>

      <SearchBox
        size="compact"
        defaultValue={q}

        showExamples={!q}
        className="max-w-3xl"
      />

      {result ? (
        <div className="mt-14">
          <DiscoveryResults result={result} />

          <section className="mt-16 rounded-[2rem] bg-paper-2/70 p-7 sm:p-9" aria-labelledby="not-found">
            <h2 id="not-found" className="font-display text-2xl font-semibold text-leaf-900">
              {m.notFoundTitle}
            </h2>
            <p className="mt-2 max-w-xl text-ink-2">{m.notFoundBody}</p>
            <Link
              href={`/wishes?q=${encodeURIComponent(q)}`}
              className={`${buttonVariants({ variant: "primary" })} mt-5`}
            >
              {m.makeWish} <NextArrow />
            </Link>
          </section>
        </div>
      ) : (
        <div className="mt-16 grid gap-14 lg:grid-cols-2">
          <section aria-labelledby="try">
            <h2 id="try" className="mb-4 font-display text-2xl font-semibold text-leaf-900">
              {m.tryTitle}
            </h2>
            <ul className="space-y-3">
              {messages.search.prompts.map((p) => (
                <li key={p}>
                  <Link
                    href={`/discover?q=${encodeURIComponent(p)}`}
                    className="group flex items-center justify-between gap-4 rounded-2xl border border-line bg-white/70 px-5 py-4 text-ink transition-all hover:border-leaf-300 hover:bg-white hover:shadow-soft"
                  >
                    {p}
                    <NextArrow className="size-4 shrink-0 text-ink-3 transition-transform rtl:group-hover:-translate-x-1 ltr:group-hover:translate-x-1" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="by-domain">
            <h2 id="by-domain" className="mb-4 font-display text-2xl font-semibold text-leaf-900">
              {m.byDomainTitle}

            </h2>
            <div className="flex flex-wrap gap-2.5">
              {domains.map((d) => (
                <DomainTag key={d.key} domain={d.key} size="md" linked count={d.count} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
