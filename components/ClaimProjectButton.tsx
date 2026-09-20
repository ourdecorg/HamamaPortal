"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { HeartHandshake, Loader2 } from "lucide-react";
import { claimProject } from "@/app/projects/actions";
import { Button } from "@/components/ui/button";
import { loginUrl } from "@/lib/next-path";
import type { ClaimState } from "@/lib/stewardship";

/**
 * "אני מטפח/ת את המיזם הזה". For a visitor it leads to sign-in and back to this section; for a
 * signed-in person it sends a stewardship REQUEST (pending) — it never grants anything by itself.
 */
export function ClaimProjectButton({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(() => claimProject(slug), { status: "idle" } as ClaimState);

  useEffect(() => {
    if (state.status === "auth_required") router.push(loginUrl(`/projects/${slug}#stewardship`));
  }, [state, router, slug]);

  if (state.status === "requested") {
    return (
      <p role="status" className="rounded-2xl bg-leaf-50 p-4 text-sm leading-relaxed text-leaf-900">
        הבקשה נשלחה. אחרי שנאשר אותה תוכלו לערוך את המיזם.
      </p>
    );
  }

  return (
    <form action={signedIn ? action : () => router.push(loginUrl(`/projects/${slug}#stewardship`))}>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <HeartHandshake />}
        אני מטפח/ת את המיזם הזה
      </Button>
      {state.status === "error" && (
        <p role="alert" className="mt-2 text-sm font-medium text-need-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
