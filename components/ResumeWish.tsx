"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { saveWish } from "@/app/wishes/actions";
import { buttonVariants } from "@/components/ui/button";
import { forgetWishDraft, takeWishDraft } from "@/lib/wish";

/**
 * Shown at /wishes?resume=1, the page people land on after signing in from "Save this wish".
 * Saves the wish that was waiting in this browser, then opens "המרחב שלי".
 */
export function ResumeWish() {
  const router = useRouter();
  const started = useRef(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return; // React StrictMode runs effects twice in development
    started.current = true;

    const draft = takeWishDraft();
    if (!draft) {
      router.replace("/wishes");
      return;
    }
    saveWish(draft).then((res) => {
      if (res.status === "saved") {
        forgetWishDraft();
        router.replace("/my-space?saved=wish");
      } else if (res.status === "auth_required") {
        setProblem("ההתחברות לא הושלמה, ולכן המשאלה עוד לא נשמרה.");
      } else {
        setProblem(res.error);
      }
    });
  }, [router]);

  if (problem) {
    return (
      <div role="alert" className="mb-10 rounded-2xl bg-need-50 px-5 py-4 text-need-700">
        <p className="font-medium">{problem}</p>
        <Link href="/wishes" className={buttonVariants({ variant: "secondary", size: "sm" }) + " mt-3"}>
          כתבו שוב את המשאלה
        </Link>
      </div>
    );
  }
  return (
    <p role="status" className="mb-10 flex items-center justify-center gap-3 rounded-2xl bg-leaf-50 px-5 py-4 font-medium text-leaf-900">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      שומרים את המשאלה שלכם…
    </p>
  );
}
