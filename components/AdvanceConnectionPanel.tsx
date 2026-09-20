"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Compass, Loader2, MessageCircle, Rocket, Send } from "lucide-react";
import { advanceConnection, requestIntroduction } from "@/app/connections/actions";
import { IntroDraft } from "@/components/IntroDraft";
import { Button } from "@/components/ui/button";
import type { Connection } from "@/lib/matching";
import { OPPORTUNITY_STATUS, type MyOpportunity } from "@/lib/opportunity";
import { loginUrl } from "@/lib/next-path";

interface Props {
  connection: Connection;
  signedIn: boolean;
  /** My saved opportunity for this connection, if I already advanced it. */
  initial: MyOpportunity | null;
}

/**
 * "אני רוצה לקדם את החיבור הזה" — the step from a suggestion to a human decision.
 * Clicking saves my interest (asking me to sign in first, if needed) and shows simple, human next steps.
 * Nothing here contacts anyone: the person always sends the message.
 */
export function AdvanceConnectionPanel({ connection: c, signedIn, initial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [opp, setOpp] = useState<MyOpportunity | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [pending, start] = useTransition();

  function advance() {
    if (!signedIn) {
      router.push(loginUrl(`${pathname}${search ? `?${search}` : ""}#${c.id}`));
      return;
    }
    setError(null);
    start(async () => {
      const res = await advanceConnection(c.id);
      if (res.status === "ok") setOpp(res.opportunity);
      else if (res.status === "auth_required") router.push(loginUrl(`${pathname}${search ? `?${search}` : ""}#${c.id}`));
      else setError(res.error);
    });
  }

  function askIntroduction() {
    if (!opp) return;
    setError(null);
    start(async () => {
      const res = await requestIntroduction(opp.id);
      if (res.status === "ok") {
        setOpp(res.opportunity);
        setDraftOpen(true);
      } else setError(res.error);
    });
  }

  // ── Not advanced yet ────────────────────────────────────────────────
  if (!opp) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={advance} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Rocket />}
            אני רוצה לקדם את החיבור הזה
          </Button>
          <IntroDraft connection={c} />
        </div>
        <p className="text-sm leading-relaxed text-ink-3">
          לא נשלחת שום הודעה, לאף אחד. זה רק מסמן שאתם רוצים לקדם את החיבור — והצעד הבא נשאר בידיים שלכם.
          {!signedIn && " כדי לשמור אותו נבקש מכם להיכנס."}
        </p>
        {error && (
          <p role="alert" className="text-sm font-medium text-need-700">
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── Advanced: confirmation + a simple human next step ─────────────────
  const status = OPPORTUNITY_STATUS[opp.status];
  const askedForIntro = opp.status === "intro_requested";

  return (
    <div className="space-y-5 rounded-3xl border border-leaf-200 bg-leaf-50/70 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-8 place-items-center rounded-full bg-leaf-600 text-white">
          <Check className="size-4" aria-hidden="true" />
        </span>
        <p role="status" className="font-display text-xl font-bold text-leaf-900">
          החיבור נשמר ב״המרחב שלי״
        </p>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-leaf-800">{status.label}</span>
      </div>
      <p className="text-sm leading-relaxed text-ink-2">{status.hint}</p>

      <div>
        <p className="mb-3 text-sm font-semibold text-ink">איזה צעד אנושי מתאים לכם עכשיו?</p>
        <ul className="grid gap-3 sm:grid-cols-3">
          <li className="rounded-2xl border border-line bg-white/80 p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-leaf-900">
              <Send className="size-4 text-leaf-600" aria-hidden="true" /> לבקש היכרות
            </p>
            <p className="mb-3 text-sm leading-snug text-ink-2">נכין טיוטת הודעה לשני הצדדים. אתם שולחים אותה — אנחנו לא.</p>
            <Button size="sm" variant={askedForIntro ? "soft" : "secondary"} onClick={askedForIntro ? () => setDraftOpen(true) : askIntroduction} disabled={pending}>
              {askedForIntro ? "לטיוטה" : "בקשת היכרות"}
            </Button>
          </li>
          <li className="rounded-2xl border border-line bg-white/80 p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-leaf-900">
              <Compass className="size-4 text-leaf-600" aria-hidden="true" /> לחקור את החיבור
            </p>
            <p className="mb-3 text-sm leading-snug text-ink-2">להכיר את שני המיזמים לפני שיוצרים קשר.</p>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link href={`/projects/${c.project_a.slug}`} className="font-medium text-link-700 underline-offset-4 hover:underline">
                {c.project_a.name}
              </Link>
              <Link href={`/projects/${c.project_b.slug}`} className="font-medium text-link-700 underline-offset-4 hover:underline">
                {c.project_b.name}
              </Link>
            </div>
          </li>
          <li className="rounded-2xl border border-line bg-white/80 p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-leaf-900">
              <MessageCircle className="size-4 text-leaf-600" aria-hidden="true" /> להציע שיחה של 30 דקות
            </p>
            <p className="mb-3 text-sm leading-snug text-ink-2">שיחה קצרה, רק כדי לבדוק אם יש כאן משהו. אפשר להתחיל מהטיוטה.</p>
            <Button size="sm" variant="secondary" onClick={() => setDraftOpen(true)}>
              לטיוטת ההודעה
            </Button>
          </li>
        </ul>
      </div>

      {draftOpen ? <IntroDraft connection={c} defaultOpen key="draft-open" /> : <IntroDraft connection={c} key="draft-closed" />}

      {error && (
        <p role="alert" className="text-sm font-medium text-need-700">
          {error}
        </p>
      )}
      <p className="text-xs text-ink-3">
        כל החיבורים ששמרתם נמצאים ב<Link href="/my-space" className="underline underline-offset-4 hover:text-leaf-700">מרחב שלי</Link>.
      </p>
    </div>
  );
}
