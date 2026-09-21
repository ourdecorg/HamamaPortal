import Link from "next/link";
import { ArrowLeft, Sprout } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="page-wrap grid place-items-center py-28 text-center">
      <div className="max-w-md">
        <span className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-leaf-50 text-leaf-600">
          <Sprout className="size-8" aria-hidden="true" />
        </span>
        <h1 className="font-display text-4xl font-semibold text-leaf-900">כאן עוד לא צמח כלום</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          הדף או המיזם שחיפשתם לא נמצאו. אולי הכתובת השתנתה — ואולי זה בדיוק המקום שבו יכול לצמוח משהו חדש.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/projects" className={buttonVariants({ variant: "primary" })}>
            לכל המיזמים <ArrowLeft />
          </Link>
          <Link href="/projects/new" className={buttonVariants({ variant: "secondary" })}>
            הוסיפו מיזם
          </Link>
        </div>
      </div>
    </div>
  );
}
