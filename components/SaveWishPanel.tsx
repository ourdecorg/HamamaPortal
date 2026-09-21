"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BookmarkPlus, Check, Loader2 } from "lucide-react";
import { saveWish } from "@/app/wishes/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { loginUrl } from "@/lib/next-path";
import { rememberWishDraft, type WishValues } from "@/lib/wish";
import { cn } from "@/lib/utils";

/**
 * "Save this wish" — shown with the results. Anonymous visitors have already seen what the wish finds;
 * only now, at the moment of a persistent action, are they asked to sign in. The wish waits in this
 * browser (see rememberWishDraft) and is saved automatically when they come back.
 */
export function SaveWishPanel({ values, signedIn }: { values: WishValues; signedIn: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    start(async () => {
      const res = await saveWish(values);
      if (res.status === "saved") setSaved(true);
      else if (res.status === "auth_required") {
        rememberWishDraft(values);
        router.push(loginUrl("/wishes?resume=1"));
      } else setError(res.error);
    });
  }

  if (saved) {
    return (
      <div role="status" className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-leaf-200 bg-leaf-50/80 p-6">
        <p className="flex items-center gap-3 font-semibold text-leaf-900">
          <span className="grid size-8 place-items-center rounded-full bg-leaf-600 text-white">
            <Check className="size-4" aria-hidden="true" />
          </span>
          המשאלה נשמרה — והיא פרטית, רק אתם רואים אותה.
        </p>
        <Link href="/my-space" className={buttonVariants({ variant: "primary", size: "sm" })}>
          למרחב שלי
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-line bg-white/80 p-6 shadow-soft">
      <div className="max-w-xl">
        <p className="font-display text-xl font-semibold text-leaf-900">רוצים לשמור את המשאלה?</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          היא תחכה לכם ב״המרחב שלי״, פרטית, ואפשר יהיה לראות שם אילו מיזמים חדשים מתאימים לה.
          {!signedIn && " כדי לשמור נבקש מכם להיכנס — ובחזרה נשמור אותה בשבילכם."}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-need-700">
            {error}
          </p>
        )}
      </div>
      <Button size="lg" onClick={save} disabled={pending} className={cn(pending && "opacity-80")}>
        {pending ? <Loader2 className="animate-spin" /> : <BookmarkPlus />}
        שמירת המשאלה
      </Button>
    </div>
  );
}
