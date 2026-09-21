"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page-wrap grid place-items-center py-28 text-center" role="alert">
      <div className="max-w-md">
        <h1 className="font-display text-4xl font-semibold text-leaf-900">משהו השתבש</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          זה לא אתם — זו אנחנו. אפשר לנסות שוב, ואם זה חוזר, לחזור לעמוד הבית.
        </p>
        <div className="mt-8">
          <Button onClick={reset}>
            <RotateCcw /> ניסיון נוסף
          </Button>
        </div>
      </div>
    </div>
  );
}
