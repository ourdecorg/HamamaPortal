import { Link } from "@/components/LocaleLink";
import { Sprout } from "lucide-react";
import { NextArrow } from "@/components/Arrows";
import { buttonVariants } from "@/components/ui/button";
import { getMessages } from "@/lib/i18n/server";

export default async function NotFound() {
  const m = (await getMessages()).errorPage;
  return (
    <div className="page-wrap grid place-items-center py-28 text-center">
      <div className="max-w-md">
        <span className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-leaf-50 text-leaf-600">
          <Sprout className="size-8" aria-hidden="true" />
        </span>
        <h1 className="font-display text-4xl font-semibold text-leaf-900">{m.notFoundTitle}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          {m.notFoundBody}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/projects" className={buttonVariants({ variant: "primary" })}>
            {m.allProjects} <NextArrow />
          </Link>
          <Link href="/projects/new" className={buttonVariants({ variant: "secondary" })}>
            {m.addProject}
          </Link>
        </div>
      </div>
    </div>
  );
}
