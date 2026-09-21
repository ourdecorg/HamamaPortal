"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Lock, Sparkles } from "lucide-react";
import { DiscoveryResults } from "@/components/DiscoveryResults";
import { SaveWishPanel } from "@/components/SaveWishPanel";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/field";
import { analyzeWish } from "@/app/[lang]/wishes/actions";
import { initialWishState } from "@/lib/wish";
import { DOMAINS, GEOGRAPHY_SCOPES } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";



interface WishFormProps {
  initialWish?: string;
  /** Supabase is configured, so a wish can be saved. Without it the form is analysis-only. */
  canSave?: boolean;
  signedIn?: boolean;
}

export function WishForm({ initialWish = "", canSave = false, signedIn = false }: WishFormProps) {
  const locale = useLocale();
  const m = useMessages().wish;
  const [state, formAction, pending] = useActionState(analyzeWish, {
    ...initialWishState,
    values: { ...initialWishState.values, wish: initialWish },
  });
  const [scope, setScope] = useState(state.values.scope);
  const resultRef = useRef<HTMLDivElement>(null);

  // After an answer arrives, bring it into view.
  useEffect(() => {
    if (state.status === "ok") resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state]);

  return (
    <div>
      <form action={formAction} className="space-y-8">
        <input type="hidden" name="locale" value={locale} />
        <div>
          <Label htmlFor="wish" className="font-sans text-base font-semibold text-leaf-800">
            {m.tellUs}
          </Label>
          <Textarea
            id="wish"
            name="wish"
            required
            rows={5}
            defaultValue={state.values.wish}
            placeholder={m.example}
            className="min-h-40 rounded-[1.75rem] p-5 text-lg leading-relaxed shadow-soft"
            aria-describedby="wish-help"
          />
          <p id="wish-help" className="mt-2 text-sm text-ink-3">
            {m.tellUsHint}
          </p>
        </div>

        <details className="group rounded-[1.75rem] border border-line bg-white/60 p-1" open={Boolean(state.values.outcome || state.values.offer || state.values.domain || state.values.scope)}>
          <summary className="cursor-pointer list-none rounded-[1.5rem] px-5 py-4 text-sm font-semibold text-leaf-800 transition-colors hover:bg-white [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-leaf-100 text-base leading-none transition-transform group-open:rotate-45">+</span>
              {m.refine}

            </span>
          </summary>

          <div className="space-y-6 px-5 pb-6 pt-3">
            <div>
              <Label htmlFor="outcome" hint={m.optional}>
                {m.outcomeLabel}
              </Label>
              <Textarea id="outcome" name="outcome" rows={3} defaultValue={state.values.outcome} placeholder={m.outcomePlaceholder} />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <Label htmlFor="domain">{m.domainLabel}</Label>
                <Select id="domain" name="domain" defaultValue={state.values.domain}>
                  <option value="">{m.domainAny}</option>
                  {Object.entries(DOMAINS).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info[locale]}
                    </option>
                  ))}
                </Select>
              </div>

              <fieldset>
                <legend className="mb-2 block text-sm font-medium text-ink">{m.scopeLabel}</legend>
                <input type="hidden" name="scope" value={scope} />
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(GEOGRAPHY_SCOPES) as [keyof typeof GEOGRAPHY_SCOPES, { he: string; en: string }][]).map(([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={scope === key}
                      onClick={() => setScope(scope === key ? "" : key)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-medium transition-all",
                        scope === key
                          ? "border-leaf-600 bg-leaf-700 text-white"
                          : "border-line-2 bg-white/80 text-ink-2 hover:border-leaf-300",
                      )}
                    >
                      {info[locale]}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <div>
              <Label htmlFor="offer" hint={m.optional}>
                {m.offerLabel}
              </Label>
              <Textarea id="offer" name="offer" rows={3} defaultValue={state.values.offer} placeholder={m.offerPlaceholder} />
              <p className="mt-2 text-sm text-ink-3">{m.offerHint}</p>
            </div>
          </div>
        </details>

        {state.status === "error" && (
          <p role="alert" className="rounded-2xl bg-need-50 px-5 py-3 text-sm font-medium text-need-700">
            {state.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {pending ? m.submitting : m.submit}
          </Button>
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <Lock className="size-4" aria-hidden="true" />
            {canSave ? m.privacySave : m.privacyNoSave}
          </p>
        </div>
      </form>

      <div ref={resultRef} className="scroll-mt-header">
        {state.status === "ok" && state.result && (
          <div className="mt-16 border-t border-line-2 pt-14">
            {canSave && (
              <div className="mb-12">
                <SaveWishPanel values={state.values} signedIn={signedIn} />
              </div>
            )}
            <DiscoveryResults result={state.result} />
          </div>
        )}
      </div>
    </div>
  );
}
