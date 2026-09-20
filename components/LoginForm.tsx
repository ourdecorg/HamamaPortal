"use client";

import { useActionState } from "react";
import { Loader2, Mail } from "lucide-react";
import { signInWithEmail, signInWithGoogle, type MagicLinkState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

const initial: MagicLinkState = { status: "idle" };

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="!size-5">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-3a7.2 7.2 0 0 1-10.72-3.78H1.32v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.34 14.3a7.2 7.2 0 0 1 0-4.6v-3.1H1.32a12 12 0 0 0 0 10.8l4.02-3.1Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.58 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.32 6.6l4.02 3.1A7.2 7.2 0 0 1 12 4.75Z" />
    </svg>
  );
}

/** Google first, then a magic link by email. No passwords. */
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInWithEmail, initial);

  return (
    <div className="space-y-8">
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="secondary" size="lg" className="w-full">
          <GoogleMark />
          המשך עם Google
        </Button>
      </form>

      <div className="flex items-center gap-4 text-sm text-ink-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line-2" />
        או
        <span className="h-px flex-1 bg-line-2" />
      </div>

      {state.status === "sent" ? (
        <div role="status" className="rounded-2xl border border-leaf-200 bg-leaf-50/80 p-5 text-leaf-900">
          <p className="font-semibold">שלחנו קישור כניסה אל {state.email}</p>
          <p className="mt-1 text-sm text-ink-2">
            פתחו את המייל באותו דפדפן ולחצו על הקישור. אם לא הגיע — בדקו בספאם.
          </p>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <Label htmlFor="email">כניסה עם קישור במייל</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              dir="ltr"
              defaultValue={state.email}
              placeholder="you@example.com"
              className="text-start"
              aria-describedby={state.status === "error" ? "email-error" : undefined}
            />
            {state.status === "error" && (
              <p id="email-error" role="alert" className="mt-2 text-sm font-medium text-need-700">
                {state.message}
              </p>
            )}
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Mail />}
            שלחו לי קישור
          </Button>
        </form>
      )}
    </div>
  );
}
