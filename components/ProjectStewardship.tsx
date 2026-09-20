import Link from "next/link";
import { Clock, Pencil } from "lucide-react";
import { withdrawClaim } from "@/app/projects/actions";
import { ClaimProjectButton } from "@/components/ClaimProjectButton";
import { Button, buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
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
  const user = await getCurrentUser();
  const mine = user ? await getMyStewardship(project.id) : null;

  return (
    <div id="stewardship" className="scroll-mt-header mt-6 border-t border-line-2 pt-5">
      {mine?.status === "approved" ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-2">את/ה מטפח/ת של המיזם הזה. אפשר לעדכן את הפרטים, הצרכים וההצעות.</p>
          <Link href={`/projects/${project.slug}/edit`} className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
            <Pencil /> עריכת המיזם
          </Link>
        </div>
      ) : mine?.status === "pending" ? (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-2">
            <Clock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
            הבקשה שלכם לטפח את המיזם נקלטה וממתינה לאישור. עד אז אי אפשר לערוך.
          </p>
          <form action={withdrawClaim.bind(null, project.slug)}>
            <Button type="submit" variant="ghost" size="sm">
              ביטול הבקשה
            </Button>
          </form>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-2">
            את/ה חלק מהמיזם? בקשו לטפח אותו כאן, ואחרי אישור תוכלו לעדכן צרכים והצעות.
          </p>
          <ClaimProjectButton slug={project.slug} signedIn={Boolean(user)} />
        </div>
      )}
    </div>
  );
}
