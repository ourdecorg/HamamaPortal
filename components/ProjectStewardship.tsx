import { Link } from "@/components/LocaleLink";
import { Clock, Pencil } from "lucide-react";
import { withdrawClaim } from "@/app/[lang]/projects/actions";
import { ClaimProjectButton } from "@/components/ClaimProjectButton";
import { Button, buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getMessages } from "@/lib/i18n/server";
import { getMyStewardship } from "@/lib/stewardship";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";

/**
 * The stewardship corner of a project page: ask to look after it, see that the request is waiting,
 * or (once an admin approved it) edit the project. Hidden in demo mode.
 */
export async function ProjectStewardship({ project }: { project: Project }) {
  if (!isSupabaseConfigured()) return null;
  const m = (await getMessages()).stewardship;
  const user = await getCurrentUser();
  const mine = user ? await getMyStewardship(project.id) : null;

  return (
    <div id="stewardship" className="scroll-mt-header mt-6 border-t border-line-2 pt-5">
      {mine?.status === "approved" ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-2">{m.approved}</p>
          <Link href={`/projects/${project.slug}/edit`} className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
            <Pencil /> {m.edit}
          </Link>
        </div>
      ) : mine?.status === "pending" ? (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-2">
            <Clock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
            {m.pending}
          </p>
          <form action={withdrawClaim.bind(null, project.slug)}>
            <Button type="submit" variant="ghost" size="sm">
              {m.withdraw}
            </Button>
          </form>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-2">
            {m.invite}
          </p>
          <ClaimProjectButton slug={project.slug} signedIn={Boolean(user)} />
        </div>
      )}
    </div>
  );
}
