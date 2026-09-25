"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { Languages, Loader2, LogIn, RefreshCw, Sparkles } from "lucide-react";
import { translateTexts } from "@/app/[lang]/projects/actions";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { LOCALE_META, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import {
  ITEM_TEXT_FIELDS,
  itemTextKey,
  machineMark,
  readTexts,
  translationSource,
  writeTexts,
  type Draft,
  type DraftTextField,
  type ItemDraft,
} from "@/lib/wizard";

/**
 * The wizard's "translation" step for ONE other language (`target`): every text of the initiative in that
 * language, editable, next to the page-language original — plus automatic translation in both directions.
 *
 * Nothing already written is ever replaced silently: when the target language has text, the person confirms
 * first, then sees the new translation and decides whether to replace. Automatic translations are marked
 * until edited by hand. A failed translation never blocks the wizard — the fields stay editable.
 */

type Direction = { from: Locale; to: Locale };
type Phase =
  | { kind: "idle" }
  | { kind: "confirm"; dir: Direction }
  | { kind: "loading"; dir: Direction }
  | { kind: "proposal"; dir: Direction; texts: Record<string, string>; current: Record<string, string>; at: string };

const hasText = (texts: Record<string, string>) => Object.values(texts).some((v) => v.trim());

export function TranslationStep({
  draft,
  onChange,
  target,
  autoTranslate,
  onSignIn,
}: {
  draft: Draft;
  onChange: (update: (d: Draft) => Draft) => void;
  /** The language this step shows and edits. */
  target: Locale;
  /** Create mode: translate right away when the target language is still empty. */
  autoTranslate: boolean;
  /** Set when automatic translation needs the visitor to sign in first (called by the sign-in button). */
  onSignIn?: () => void;
}) {
  const page = useLocale();
  const messages = useMessages();
  const m = messages.wizard;
  const tm = m.translation;
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const autoStarted = useRef(false);

  const names = { language: tm.languages[target], source: tm.languages[page] };
  const forward: Direction = { from: page, to: target };
  const reverse: Direction = { from: target, to: page };
  const words = (dir: Direction) => ({ from: tm.languages[dir.from], to: tm.languages[dir.to] });

  const sourceTexts = readTexts(draft, page, page);
  const targetTexts = readTexts(draft, target, page);
  const targetFilled = hasText(translationSource(draft, target, page));
  const busy = phase.kind === "loading";

  async function start(dir: Direction, confirmed = false) {
    const source = translationSource(draft, dir.from, page);
    if (!Object.keys(source).length) {
      setNotice({ ok: false, text: fmt(tm.nothingToTranslate, words(dir)) });
      return;
    }
    const current = readTexts(draft, dir.to, page);
    const replacing = Object.keys(source).some((key) => current[key]?.trim());
    if (replacing && !confirmed) {
      setNotice(null);
      setPhase({ kind: "confirm", dir });
      return;
    }

    setNotice(null);
    setPhase({ kind: "loading", dir });
    const name = (current.name || readTexts(draft, dir.from, page).name || sourceTexts.name).trim();
    const res = await translateTexts({
      from: dir.from,
      to: dir.to,
      name,
      items: Object.entries(source).map(([id, text]) => ({ id, text })),
    }).catch(() => ({ status: "error", reason: "failed" }) as const);

    if (res.status !== "ok") {
      setPhase({ kind: "idle" });
      const reason = res.status === "auth_required" ? "signIn" : res.reason === "rate_limited" ? "rateLimited" : res.reason === "unavailable" ? "unavailable" : "failed";
      setNotice({ ok: false, text: fmt(tm[reason], words(dir)) });
      return;
    }
    const texts = Object.fromEntries(res.items.map((item) => [item.id, item.text]));
    if (replacing) {
      // Show the new version first; the current text is replaced only when the person says so.
      setPhase({ kind: "proposal", dir, texts, current, at: res.at });
      return;
    }
    onChange((d) => writeTexts(d, dir.to, page, texts, { from: dir.from, at: res.at }));
    setPhase({ kind: "idle" });
    setNotice({ ok: true, text: fmt(tm.done, words(dir)) });
  }

  function applyProposal() {
    if (phase.kind !== "proposal") return;
    const { dir, texts, at } = phase;
    onChange((d) => writeTexts(d, dir.to, page, texts, { from: dir.from, at }));
    setPhase({ kind: "idle" });
    setNotice({ ok: true, text: fmt(tm.applied, words(dir)) });
  }

  // Create mode: arriving at this step with nothing in the target language translates right away.
  useEffect(() => {
    if (!autoTranslate || onSignIn || autoStarted.current) return; // StrictMode runs effects twice in development
    autoStarted.current = true;
    const source = translationSource(draft, page, page);
    const current = readTexts(draft, target, page);
    if (Object.keys(source).length && !Object.keys(source).some((key) => current[key]?.trim())) {
      startTransition(() => void start(forward));
    }
    // Runs once, on arrival: later edits must not re-trigger a translation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setText = (key: string, value: string) => onChange((d) => writeTexts(d, target, page, { [key]: value }));

  // ------------------------------------------------------------ labels ---

  const fieldLabels: Record<DraftTextField, string> = {
    name: m.identity.name,
    tagline: m.identity.tagline,
    short_description: m.identity.description,
    vision: m.intent.vision,
    problem: m.intent.problem,
    desired_change: m.intent.change,
    place: m.details.placeAria,
    steward_role: m.details.role,
  };
  const itemGroups = [
    { kind: "need" as const, title: tm.needsSection, label: m.item.need, list: draft.needs },
    { kind: "offer" as const, title: tm.offersSection, label: m.item.offer, list: draft.offers },
  ];
  function labelOf(key: string): string {
    if (key in fieldLabels) return fieldLabels[key as DraftTextField];
    for (const group of itemGroups) {
      const index = group.list.findIndex((it) => key.startsWith(`${group.kind}:${it.uid}:`));
      if (index >= 0) return `${group.label} ${index + 1} · ${key.endsWith(":title") ? m.item[group.kind === "need" ? "needTitle" : "offerTitle"] : m.item.detail}`;
    }
    return key;
  }

  // ------------------------------------------------------------ fields ---

  const targetMeta = LOCALE_META[target];
  const sourceMeta = LOCALE_META[page];

  function renderField({ textKey, label, multiline, rows = 3, hint }: { textKey: string; label: string; multiline?: boolean; rows?: number; hint?: string }) {
    const id = `tr-${target}-${textKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const source = sourceTexts[textKey]?.trim();
    const mark = machineMark(draft, target, textKey);
    const props = {
      id,
      value: targetTexts[textKey] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(textKey, e.target.value),
      dir: targetMeta.dir,
      lang: target,
      readOnly: busy,
      placeholder: textKey === "name" ? source : undefined,
      className: cn("text-start", busy && "opacity-60"),
    };
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={id} className="mb-0">
            {label}
          </Label>
          {mark && (
            <span
              title={fmt(tm.machineTitle, { from: tm.languages[mark.from] })}
              className="inline-flex items-center gap-1 rounded-full bg-link-50 px-2 py-0.5 text-xs font-medium text-link-700"
            >
              <Sparkles className="size-3" aria-hidden="true" />
              {tm.machineBadge}
            </span>
          )}
        </div>
        {source && textKey !== "name" && (
          <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ink-3">
            <span className="font-medium text-ink-2">{fmt(tm.inSource, { from: tm.languages[page] })}</span>{" "}
            <span dir={sourceMeta.dir} lang={page}>
              {source}
            </span>
          </p>
        )}
        <div className="mt-2">{multiline ? <Textarea rows={rows} {...props} /> : <Input {...props} />}</div>
        {hint && <p className="mt-1.5 text-sm text-ink-3">{hint}</p>}
      </div>
    );
  }

  const showOptional = (f: DraftTextField) => Boolean(sourceTexts[f]?.trim() || targetTexts[f]?.trim());
  const itemFilled = (kind: "need" | "offer", it: ItemDraft) =>
    ITEM_TEXT_FIELDS.some((f) => sourceTexts[itemTextKey(kind, it.uid, f)]?.trim() || targetTexts[itemTextKey(kind, it.uid, f)]?.trim());

  // ---------------------------------------------------------------- UI ---

  return (
    <section>
      <div className="mb-8">
        <h2 className="font-display text-3xl font-semibold leading-tight text-leaf-900 sm:text-4xl">{fmt(tm.title, names)}</h2>
        <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-2">{fmt(tm.body, names)}</p>
        {autoTranslate && <p className="mt-2 max-w-xl text-sm text-ink-3">{tm.skipNote}</p>}
      </div>

      {/* actions */}
      {onSignIn ? (
        <div className="mb-8 rounded-2xl border border-line-2 bg-paper-2/80 p-5">
          <p className="leading-relaxed text-ink-2">{fmt(tm.signIn, words(forward))}</p>
          <Button className="mt-4" onClick={onSignIn}>
            <LogIn /> {tm.signInButton}
          </Button>
        </div>
      ) : (
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <Button variant={targetFilled ? "secondary" : "primary"} onClick={() => start(forward)} disabled={busy || phase.kind !== "idle"}>
            {targetFilled ? <RefreshCw /> : <Languages />}
            {fmt(targetFilled ? tm.regenerateTo : tm.translateTo, words(forward))}
          </Button>
          {targetFilled && (
            <Button variant="ghost" onClick={() => start(reverse)} disabled={busy || phase.kind !== "idle"}>
              <RefreshCw /> {fmt(tm.regenerateFrom, words(reverse))}
            </Button>
          )}
        </div>
      )}

      {phase.kind === "loading" && (
        <p role="status" className="mb-8 flex items-center gap-3 rounded-2xl bg-leaf-50 px-5 py-4 font-medium text-leaf-900">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {fmt(tm.translating, words(phase.dir))}
        </p>
      )}

      {notice && (
        <p role={notice.ok ? "status" : "alert"} className={cn("mb-8 text-sm font-medium", notice.ok ? "text-leaf-700" : "text-need-700")}>
          {notice.text}
        </p>
      )}

      {phase.kind === "confirm" && (
        <div role="alertdialog" aria-labelledby={`confirm-${target}`} className="mb-8 rounded-2xl border border-need-200 bg-need-50/70 p-5">
          <p id={`confirm-${target}`} className="font-semibold text-ink">
            {fmt(tm.confirmTitle, words(phase.dir))}
          </p>
          <p className="mt-1.5 leading-relaxed text-ink-2">{fmt(tm.confirmBody, words(phase.dir))}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => start(phase.dir, true)}>
              <Languages /> {tm.confirmYes}
            </Button>
            <Button variant="ghost" onClick={() => setPhase({ kind: "idle" })}>
              {tm.cancel}
            </Button>
          </div>
        </div>
      )}

      {phase.kind === "proposal" && (
        <div role="region" aria-labelledby={`proposal-${target}`} className="mb-10 rounded-3xl border border-leaf-200 bg-leaf-50/60 p-6">
          <p id={`proposal-${target}`} className="font-display text-xl font-semibold text-leaf-900">
            {fmt(tm.proposalTitle, words(phase.dir))}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{tm.proposalBody}</p>
          <dl className="mt-5 max-h-[28rem] space-y-4 overflow-auto rounded-2xl bg-white/80 p-5">
            {Object.entries(phase.texts).map(([key, text]) => (
              <div key={key}>
                <dt className="text-sm font-medium text-ink-3">{labelOf(key)}</dt>
                <dd dir={LOCALE_META[phase.dir.to].dir} lang={phase.dir.to} className="mt-1 whitespace-pre-line leading-relaxed text-ink">
                  {text}
                </dd>
                {phase.current[key]?.trim() && phase.current[key].trim() !== text && (
                  <dd className="mt-1 line-clamp-2 text-sm text-ink-3">
                    <span className="font-medium">{tm.proposalCurrent}</span>{" "}
                    <span dir={LOCALE_META[phase.dir.to].dir} lang={phase.dir.to} className="line-through decoration-ink-3/40">
                      {phase.current[key]}
                    </span>
                  </dd>
                )}
              </div>
            ))}
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={applyProposal}>{tm.apply}</Button>
            <Button variant="ghost" onClick={() => setPhase({ kind: "idle" })}>
              {tm.keep}
            </Button>
          </div>
        </div>
      )}

      {/* the texts in the target language */}
      <div className="space-y-10">
        <fieldset className="space-y-7">
          <legend className="mb-4 text-sm font-semibold tracking-wide text-leaf-600">{tm.projectSection}</legend>
          {renderField({ textKey: "name", label: fieldLabels.name, hint: fmt(tm.nameHint, { to: names.language }) })}
          {renderField({ textKey: "tagline", label: fieldLabels.tagline })}
          {renderField({ textKey: "short_description", label: fieldLabels.short_description, multiline: true, rows: 4 })}
          {renderField({ textKey: "vision", label: fieldLabels.vision, multiline: true })}
          {renderField({ textKey: "problem", label: fieldLabels.problem, multiline: true })}
          {renderField({ textKey: "desired_change", label: fieldLabels.desired_change, multiline: true })}
          {draft.scope && showOptional("place") && renderField({ textKey: "place", label: fieldLabels.place })}
          {showOptional("steward_role") && renderField({ textKey: "steward_role", label: fieldLabels.steward_role })}
        </fieldset>

        {itemGroups.map((group) => {
          const items = group.list.filter((it) => itemFilled(group.kind, it));
          if (!items.length) return null;
          return (
            <fieldset key={group.kind} className="space-y-6">
              <legend className="mb-4 text-sm font-semibold tracking-wide text-leaf-600">{group.title}</legend>
              {items.map((it) => (
                <div
                  key={it.uid}
                  className={cn(
                    "space-y-5 rounded-[1.75rem] border p-5 sm:p-6",
                    group.kind === "need" ? "border-dashed border-need-400/70 bg-need-50/60" : "border-offer-400/50 bg-offer-50/60",
                  )}
                >
                  <p className={cn("text-sm font-semibold", group.kind === "need" ? "text-need-700" : "text-offer-700")}>
                    {group.label} {group.list.indexOf(it) + 1}
                  </p>
                  {renderField({
                    textKey: itemTextKey(group.kind, it.uid, "title"),
                    label: group.kind === "need" ? m.item.needTitle : m.item.offerTitle,
                  })}
                  {renderField({ textKey: itemTextKey(group.kind, it.uid, "description"), label: m.item.detail, multiline: true })}
                </div>
              ))}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}
