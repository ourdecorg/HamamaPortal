import { Link } from "@/components/LocaleLink";
import { Check, Pencil } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getMessages } from "@/lib/i18n/server";
import { getMyStewardship } from "@/lib/stewardship";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";

/**
 * The lightweight confirmation after the wizard created a project (…/projects/<slug>?created=1).
 * Shown only to the project's approved owner, so the URL cannot make anybody else's page claim "created".
 */
export async function ProjectCreatedNotice({ project }: { project: Project }) {
  if (!isSupabaseConfigured()) return null;
  const mine = await getMyStewardship(project.id);
  if (mine?.role !== "owner" || mine.status !== "approved") return null;
  const m = (await getMessages()).stewardship;

  return (
    <div className="page-wrap pt-6">
      <div role="status" className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-leaf-200 bg-leaf-50/80 p-5 sm:p-6">
        <p className="flex items-center gap-3 font-semibold text-leaf-900">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-leaf-600 text-white">
            <Check className="size-4" aria-hidden="true" />
          </span>
          {m.createdTitle}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${project.slug}/edit`} className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
            <Pencil /> {m.editShort}
          </Link>
          <Link href="/my-space#my-projects" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
            {m.toMySpace}
          </Link>
        </div>
      </div>
    </div>
  );
}
