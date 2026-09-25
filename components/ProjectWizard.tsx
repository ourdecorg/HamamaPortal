"use client";

import { Link } from "@/components/LocaleLink";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, CircleDashed, Copy, Download, Gift, Loader2, Plus, Save, Sprout, Trash2 } from "lucide-react";
import { NextArrow, PrevArrow } from "@/components/Arrows";
import { createProject, saveProjectEdits } from "@/app/[lang]/projects/actions";
import { ProjectCard } from "@/components/ProjectCard";
import { TranslationStep } from "@/components/TranslationStep";
import { TypeIcon } from "@/components/TypeIcon";
import { useLocale, useLocalePath, useMessages } from "@/components/LocaleProvider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import {
  COLLAB_TYPES,
  DOMAINS,
  EXCHANGE_TYPES,
  GEOGRAPHY_SCOPES,
  LIFECYCLE_STAGES,
  STAGE_ORDER,
  ACTIVITY_STATUS,
} from "@/lib/taxonomy";
import {
  DRAFT_TEXT_FIELDS,
  STEP_IDS,
  buildProject,
  buildProjectFile,
  clearMarks,
  emptyDraft,
  itemTextKey,
  newItem,
  slugify,
  validateFile,
  validateStep,
  type Draft,
  type ItemDraft,
  type StepId,
} from "@/lib/wizard";
import { LOCALES } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/format";
import { loginUrl } from "@/lib/next-path";
import { forgetProjectDraft, rememberProjectDraft, takeProjectDraft } from "@/lib/project-draft";
import { cn } from "@/lib/utils";
import type { GeographyScope, Need } from "@/types/project";

// ------------------------------------------------------------------ bits ----

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 text-sm font-medium text-need-700">
      {message}
    </p>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-sm text-ink-3">{children}</p>;
}

function ToggleChip({
  active,
  onClick,
  children,
  tone = "leaf",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "leaf" | "need" | "offer";
}) {
  const on = { leaf: "border-leaf-600 bg-leaf-700 text-white", need: "border-need-500 bg-need-500 text-white", offer: "border-offer-500 bg-offer-500 text-white" }[tone];
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all",
        active ? on : "border-line-2 bg-white/80 text-ink-2 hover:border-leaf-300 hover:text-leaf-800",
      )}
    >
      {children}
    </button>
  );
}

function StepIntro({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-8">
      <h2 className="font-display text-3xl font-semibold leading-tight text-leaf-900 sm:text-4xl">{title}</h2>
      <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-2">{body}</p>
    </div>
  );
}

// -------------------------------------------------------- need / offer list --



function ItemEditor({
  kind,
  item,
  index,
  onChange,
  onRemove,
  showStatus = false,
}: {
  kind: "need" | "offer";
  item: ItemDraft;
  index: number;
  onChange: (patch: Partial<ItemDraft>) => void;
  onRemove: () => void;
  /** Edit mode, needs only: a steward can mark a need as in conversation / fulfilled. */
  showStatus?: boolean;
}) {
  const isNeed = kind === "need";
  const Icon = isNeed ? CircleDashed : Gift;
  const [showKeywords, setShowKeywords] = useState(Boolean(item.keywords));
  const locale = useLocale();
  const messages = useMessages();
  const m = messages.wizard.item;
  const needStatus = messages.project.needStatus;

  return (
    <fieldset
      className={cn(
        "rounded-[1.75rem] border p-5 sm:p-6",
        isNeed ? "border-dashed border-need-400/70 bg-need-50/60" : "border-offer-400/50 bg-offer-50/60",
      )}
    >
      <legend className={cn("flex items-center gap-2 px-2 text-sm font-semibold", isNeed ? "text-need-700" : "text-offer-700")}>
        <Icon className="size-4" aria-hidden="true" />
        {isNeed ? m.need : m.offer} {index + 1}
      </legend>

      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-ink">{m.whichType}</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(EXCHANGE_TYPES).map(([key, info]) => (
              <ToggleChip key={key} active={item.type === key} tone={kind} onClick={() => onChange({ type: key })}>
                <TypeIcon type={key} className="size-3.5" />
                {info[locale]}
              </ToggleChip>
            ))}
          </div>
        </div>

        {showStatus && isNeed && (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{m.needState}</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(needStatus) as Need["status"][]).map((st) => (
                <ToggleChip key={st} tone="need" active={(item.status ?? "open") === st} onClick={() => onChange({ status: st })}>
                  {needStatus[st]}
                </ToggleChip>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label htmlFor={`${item.uid}-title`}>{isNeed ? m.needTitle : m.offerTitle}</Label>
          <Input
            id={`${item.uid}-title`}
            value={item.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder={isNeed ? m.needTitlePh : m.offerTitlePh}
          />
        </div>

        <div>
          <Label htmlFor={`${item.uid}-desc`}>{m.detail}</Label>
          <Textarea
            id={`${item.uid}-desc`}
            rows={3}
            value={item.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder={isNeed ? m.needDetailPh : m.offerDetailPh}
          />
        </div>

        {showKeywords ? (
          <div>
            <Label htmlFor={`${item.uid}-kw`} hint={messages.wish.optional}>
              {m.keywords}
            </Label>
            <Input
              id={`${item.uid}-kw`}
              value={item.keywords}
              onChange={(e) => onChange({ keywords: e.target.value })}
              placeholder={m.keywordsPh}
              dir="ltr"
            />
            <Hint>{m.keywordsHint}</Hint>
          </div>
        ) : (
          <button type="button" onClick={() => setShowKeywords(true)} className="text-sm font-medium text-ink-2 underline-offset-4 hover:text-leaf-700 hover:underline">
            {m.addKeywords}
          </button>
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 /> {m.remove}
        </Button>
      </div>
    </fieldset>
  );
}

// ----------------------------------------------------------------- wizard ----

interface ProjectWizardProps {
  /** "create": a new project. "edit": a steward updating a stored project. */
  mode?: "create" | "edit";
  initialDraft?: Draft;
  /** Edit mode: the project being edited. Its slug (and so its URL) cannot change. */
  slug?: string;
  /** Edit mode: where saving (or cancelling) leads. Default: the project's page. */
  doneHref?: string;
  /**
   * Create mode with a database: "publish" writes the project straight to Supabase.
   * Without one (demo mode) the last step offers the JSON file instead.
   */
  persist?: boolean;
  /** Create mode: whether the visitor is already signed in (only changes the wording; the server decides). */
  signedIn?: boolean;
  /**
   * Create mode: the visitor is back from signing in, and the draft that waited in this browser is picked up —
   * "publish" submits it, "translate" reopens it at the translation step.
   */
  resume?: "publish" | "translate";
}

export function ProjectWizard({
  mode = "create",
  initialDraft,
  slug: editSlug,
  doneHref,
  persist = false,
  signedIn = false,
  resume,
}: ProjectWizardProps) {
  const editing = mode === "edit" && Boolean(editSlug);
  const router = useRouter();
  const locale = useLocale();
  const lp = useLocalePath();
  const messages = useMessages();
  const m = messages.wizard;
  const [draft, setDraft] = useState<Draft>(initialDraft ?? emptyDraft);
  const [saveState, setSaveState] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving_, startSaving] = useTransition();
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [devMessage, setDevMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [resuming, setResuming] = useState(Boolean(resume));
  const resumeStarted = useRef(false);

  const step: StepId = STEP_IDS[stepIndex];
  const isLast = stepIndex === STEP_IDS.length - 1;

  // A text edited by hand is no longer an automatic translation.
  const patch = (p: Partial<Draft>) =>
    setDraft((d) => clearMarks({ ...d, ...p }, locale, DRAFT_TEXT_FIELDS.filter((f) => f in p)));
  const patchItem = (kind: "needs" | "offers", uid: string, p: Partial<ItemDraft>) =>
    setDraft((d) =>
      clearMarks(
        { ...d, [kind]: d[kind].map((it) => (it.uid === uid ? { ...it, ...p } : it)) },
        locale,
        (["title", "description"] as const).filter((f) => f in p).map((f) => itemTextKey(kind === "needs" ? "need" : "offer", uid, f)),
      ),
    );

  const previewProject = useMemo(
    () => buildProject(draft, { name: m.preview.namePlaceholder, tagline: m.preview.taglinePlaceholder }, locale),
    [draft, m.preview.namePlaceholder, m.preview.taglinePlaceholder, locale],
  );
  const file = useMemo(() => buildProjectFile(draft, locale), [draft, locale]);
  const fileIssues = useMemo(() => (isLast ? validateFile(file) : []), [file, isLast]);
  const json = useMemo(() => JSON.stringify(file, null, 2), [file]);
  const slug = editing ? editSlug! : draft.slug || slugify(draft.name);
  const doneLink = doneHref ?? `/projects/${editSlug}`;

  function saveEdits() {
    setSaveState(null);
    startSaving(async () => {
      const res = await saveProjectEdits(editSlug!, draft, locale);
      if (res.status === "saved") {
        router.push(lp(doneLink));
        router.refresh();
      } else if (res.status === "auth_required") {
        router.push(loginUrl(doneHref ? doneHref : `/projects/${editSlug}/edit`, locale));
      } else if (res.status === "forbidden") {
        setSaveState({ ok: false, text: m.review.forbidden });
      } else {
        setSaveState({ ok: false, text: res.error });
      }
    });
  }

  /** Create the project in Supabase. A visitor is sent to sign in first; the draft waits in this browser. */
  async function publishDraft(d: Draft, fromResume: boolean): Promise<"navigating" | "stay"> {
    const res = await createProject(d, locale);
    if (res.status === "created") {
      forgetProjectDraft();
      router.push(lp(`/projects/${res.slug}?created=1`));
      return "navigating";
    }
    if (res.status === "auth_required") {
      rememberProjectDraft(d);
      if (!fromResume) {
        router.push(loginUrl("/projects/new?resume=1", locale));
        return "navigating";
      }
      setSaveState({ ok: false, text: m.review.signInIncomplete });
      return "stay";
    }
    setSaveState({ ok: false, text: res.error });
    return "stay";
  }

  function publish() {
    setSaveState(null);
    startSaving(async () => {
      await publishDraft(draft, false);
    });
  }

  // Back from signing in: the draft that waited in this browser is submitted, once.
  useEffect(() => {
    if (!resume || resumeStarted.current) return; // React StrictMode runs effects twice in development
    resumeStarted.current = true;

    const waiting = takeProjectDraft();
    if (!waiting) {
      router.replace(lp("/projects/new"));
      return;
    }
    startSaving(async () => {
      if (resume === "translate") {
        // Signed in now: continue at the translation step, which translates on arrival.
        setDraft(waiting);
        setStepIndex(STEP_IDS.indexOf("translation"));
        setResuming(false);
        return;
      }
      setDraft(waiting);
      setStepIndex(STEP_IDS.length - 1);
      // On success the page navigates away, so the "saving…" notice stays until then.
      if ((await publishDraft(waiting, true)) === "stay") setResuming(false);
    });
    // publishDraft only uses the router and state setters, which do not change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, router]);

  /** Automatic translation needs an account: keep the draft in this browser and come back to this step. */
  function signInToTranslate() {
    rememberProjectDraft(draft);
    router.push(loginUrl("/projects/new?resume=translate", locale));
  }

  function next() {
    const found = validateStep(step, draft, m.errors);
    setErrors(found);
    if (Object.keys(found).length === 0) {
      setStepIndex((i) => Math.min(i + 1, STEP_IDS.length - 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  function back() {
    setErrors({});
    setStepIndex((i) => Math.max(i - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function download() {
    const blob = new Blob([json + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard unavailable — the JSON is still selectable */
    }
  }

  async function saveLocally() {
    setSaving(true);
    setDevMessage(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(file),
      });
      const body = (await res.json()) as { file?: string; error?: string; code?: string; slug?: string };
      setDevMessage(
        res.ok
          ? { ok: true, text: fmt(m.demo.savedAs, { file: body.file ?? "" }) }
          : {
              ok: false,
              text: body.code === "slug_exists" ? fmt(m.demo.slugExists, { slug: body.slug ?? "" }) : (body.error ?? m.demo.saveFailed),
            },
      );
    } catch {
      setDevMessage({ ok: false, text: m.demo.saveFailed });
    } finally {
      setSaving(false);
    }
  }

  if (resuming) {
    return (
      <p role="status" className="flex items-center justify-center gap-3 rounded-2xl bg-leaf-50 px-5 py-4 font-medium text-leaf-900">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {resume === "translate" ? m.translation.restoring : m.review.creating}
      </p>
    );
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-16">
      <div>
        {/* progress */}
        <nav aria-label={m.stepsAria} className="mb-10">
          <ol className="flex items-center gap-2">
            {STEP_IDS.map((id, i) => (
              <li key={id} className="flex flex-1 items-center gap-2 last:flex-none">
                <span
                  aria-current={i === stepIndex ? "step" : undefined}
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors",
                    i < stepIndex && "bg-leaf-600 text-white",
                    i === stepIndex && "bg-leaf-800 text-white ring-4 ring-leaf-200/70",
                    i > stepIndex && "bg-paper-3 text-ink-3",
                  )}
                >
                  {i < stepIndex ? <Check className="size-4" /> : i + 1}
                </span>
                {i < STEP_IDS.length - 1 && (
                  <span className={cn("h-0.5 flex-1 rounded-full", i < stepIndex ? "bg-leaf-500" : "bg-line-2")} aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm font-medium text-ink-2">
            {fmt(m.stepOf, { n: stepIndex + 1, total: STEP_IDS.length, label: m.steps[step] })}
          </p>
        </nav>

        {/* 1 · IDENTITY */}
        {step === "identity" && (
          <section>
            <StepIntro title={m.identity.title} body={m.identity.body} />
            <div className="space-y-7">
              <div>
                <Label htmlFor="name">{m.identity.name}</Label>
                <Input
                  id="name"
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value, ...(draft.slugTouched ? {} : { slug: slugify(e.target.value) }) })}
                  placeholder={m.identity.namePh}
                  autoFocus
                />
                <FieldError message={errors.name} />
              </div>
              <div>
                <Label htmlFor="tagline">{m.identity.tagline}</Label>
                <Input
                  id="tagline"
                  value={draft.tagline}
                  onChange={(e) => patch({ tagline: e.target.value })}
                  placeholder={m.identity.taglinePh}
                />
                <FieldError message={errors.tagline} />
              </div>
              <div>
                <Label htmlFor="short_description">{m.identity.description}</Label>
                <Textarea
                  id="short_description"
                  rows={4}
                  value={draft.short_description}
                  onChange={(e) => patch({ short_description: e.target.value })}
                  placeholder={m.identity.descriptionPh}
                />
                <FieldError message={errors.short_description} />
              </div>
              <div>
                <Label htmlFor="slug" hint={editing ? m.identity.slugHintEdit : m.identity.slugHintNew}>
                  {m.identity.slug}
                </Label>
                <Input
                  id="slug"
                  dir="ltr"
                  value={editing ? slug : draft.slug || slugify(draft.name)}
                  onChange={(e) => patch({ slug: e.target.value.toLowerCase(), slugTouched: true })}
                  readOnly={editing}
                  className={cn("max-w-xs text-start", editing && "bg-paper-2 text-ink-3")}
                />
                <Hint>
                  {editing ? m.identity.slugNoteEdit : m.identity.slugNoteNew}
                  <span dir="ltr" className="font-mono text-ink-2">/projects/{slug}</span>
                  {!editing && persist && m.identity.slugTaken}
                </Hint>
                <FieldError message={errors.slug} />
              </div>
            </div>
          </section>
        )}

        {/* 2 · INTENT */}
        {step === "intent" && (
          <section>
            <StepIntro title={m.intent.title} body={m.intent.body} />
            <div className="space-y-7">
              <div>
                <Label htmlFor="vision">{m.intent.vision}</Label>
                <Textarea
                  id="vision"
                  rows={3}
                  value={draft.vision}
                  onChange={(e) => patch({ vision: e.target.value })}
                  placeholder={m.intent.visionPh}
                  autoFocus
                />
                <FieldError message={errors.vision} />
              </div>
              <div>
                <Label htmlFor="problem">{m.intent.problem}</Label>
                <Textarea
                  id="problem"
                  rows={3}
                  value={draft.problem}
                  onChange={(e) => patch({ problem: e.target.value })}
                  placeholder={m.intent.problemPh}
                />
                <FieldError message={errors.problem} />
              </div>
              <div>
                <Label htmlFor="desired_change">{m.intent.change}</Label>
                <Textarea
                  id="desired_change"
                  rows={3}
                  value={draft.desired_change}
                  onChange={(e) => patch({ desired_change: e.target.value })}
                  placeholder={m.intent.changePh}
                />
                <FieldError message={errors.desired_change} />
              </div>
            </div>
          </section>
        )}

        {/* 3 · NEEDS */}
        {step === "needs" && (
          <section>
            <StepIntro title={m.needs.title} body={m.needs.body} />
            <div className="space-y-5">
              {draft.needs.map((n, i) => (
                <ItemEditor
                  key={n.uid}
                  kind="need"
                  showStatus={editing}
                  item={n}
                  index={i}
                  onChange={(p) => patchItem("needs", n.uid, p)}
                  onRemove={() => patch({ needs: draft.needs.filter((x) => x.uid !== n.uid) })}
                />
              ))}
              {draft.needs.length === 0 && (
                <p className="rounded-2xl border border-dashed border-line-2 p-5 text-ink-2">
                  {m.needs.empty}
                </p>
              )}
              {draft.needs.length < 5 && (
                <Button variant="secondary" onClick={() => patch({ needs: [...draft.needs, newItem("community")] })}>
                  <Plus /> {m.needs.add}
                </Button>
              )}
            </div>
          </section>
        )}

        {/* 4 · OFFERS */}
        {step === "offers" && (
          <section>
            <StepIntro title={m.offers.title} body={m.offers.body} />
            <div className="space-y-5">
              {draft.offers.map((o, i) => (
                <ItemEditor
                  key={o.uid}
                  kind="offer"
                  item={o}
                  index={i}
                  onChange={(p) => patchItem("offers", o.uid, p)}
                  onRemove={() => patch({ offers: draft.offers.filter((x) => x.uid !== o.uid) })}
                />
              ))}
              {draft.offers.length === 0 && (
                <p className="rounded-2xl border border-dashed border-line-2 p-5 text-ink-2">
                  {m.offers.empty}
                </p>
              )}
              {draft.offers.length < 5 && (
                <Button variant="secondary" onClick={() => patch({ offers: [...draft.offers, newItem("knowledge")] })}>
                  <Plus /> {m.offers.add}
                </Button>
              )}
            </div>
          </section>
        )}

        {/* 5 · DETAILS */}
        {step === "details" && (
          <section>
            <StepIntro title={m.details.title} body={m.details.body} />
            <div className="space-y-9">
              <fieldset>
                <legend className="mb-2.5 text-sm font-medium text-ink">{m.details.domains}</legend>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(DOMAINS).map(([key, info]) => (
                    <ToggleChip
                      key={key}
                      active={draft.domains.includes(key)}
                      onClick={() =>
                        patch({ domains: draft.domains.includes(key) ? draft.domains.filter((d) => d !== key) : [...draft.domains, key] })
                      }
                    >
                      {info[locale]}
                    </ToggleChip>
                  ))}
                </div>
                <FieldError message={errors.domains} />
              </fieldset>

              <fieldset>
                <legend className="mb-2.5 text-sm font-medium text-ink">{m.details.stage}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {STAGE_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={draft.stage === s}
                      onClick={() => patch({ stage: s })}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-start transition-all",
                        draft.stage === s ? "border-leaf-600 bg-leaf-50 ring-2 ring-leaf-200" : "border-line-2 bg-white/70 hover:border-leaf-300",
                      )}
                    >
                      <span className="block font-medium text-ink">{LIFECYCLE_STAGES[s][locale]}</span>
                      <span className="text-sm text-ink-3">{LIFECYCLE_STAGES[s].hint[locale]}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-7 sm:grid-cols-2">
                <fieldset>
                  <legend className="mb-2.5 text-sm font-medium text-ink">{m.details.activity}</legend>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(ACTIVITY_STATUS) as (keyof typeof ACTIVITY_STATUS)[]).map((a) => (
                      <ToggleChip key={a} active={draft.activity === a} onClick={() => patch({ activity: a })}>
                        {ACTIVITY_STATUS[a][locale]}
                      </ToggleChip>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2.5 text-sm font-medium text-ink">{m.details.scope}</legend>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(GEOGRAPHY_SCOPES) as GeographyScope[]).map((s) => (
                      <ToggleChip key={s} active={draft.scope === s} onClick={() => patch({ scope: draft.scope === s ? "" : s })}>
                        {GEOGRAPHY_SCOPES[s][locale]}
                      </ToggleChip>
                    ))}
                  </div>
                  {draft.scope && (
                    <Input className="mt-3" value={draft.place} onChange={(e) => patch({ place: e.target.value })} placeholder={m.details.placePh} aria-label={m.details.placeAria} />
                  )}
                </fieldset>
              </div>

              <fieldset>
                <legend className="mb-1 text-sm font-medium text-ink">{m.details.collab}</legend>
                <Hint>{m.details.collabHint}</Hint>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(COLLAB_TYPES).map(([key, info]) => (
                    <ToggleChip
                      key={key}
                      active={draft.collab.includes(key)}
                      onClick={() => patch({ collab: draft.collab.includes(key) ? draft.collab.filter((c) => c !== key) : [...draft.collab, key] })}
                    >
                      {info[locale]}
                    </ToggleChip>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label htmlFor="steward">{m.details.steward}</Label>
                  <Input id="steward" value={draft.steward_name} onChange={(e) => patch({ steward_name: e.target.value })} placeholder={m.details.stewardPh} />
                </div>
                <div>
                  <Label htmlFor="steward-role">{m.details.role}</Label>
                  <Input id="steward-role" value={draft.steward_role} onChange={(e) => patch({ steward_role: e.target.value })} placeholder={m.details.rolePh} />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-3">
                {(
                  [
                    ["website", m.details.website],
                    ["linkedin", "LinkedIn"],
                    ["github", "GitHub"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <Label htmlFor={key}>{label}</Label>
                    <Input id={key} dir="ltr" value={draft[key]} onChange={(e) => patch({ [key]: e.target.value })} placeholder="https://…" className="text-start" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 6 · TRANSLATION — the same texts in the other language(s) */}
        {step === "translation" &&
          LOCALES.filter((l) => l !== locale).map((target) => (
            <TranslationStep
              key={target}
              draft={draft}
              onChange={setDraft}
              target={target}
              autoTranslate={!editing}
              onSignIn={!editing && persist && !signedIn ? signInToTranslate : undefined}
            />
          ))}

        {/* 7 · REVIEW — saved to the portal: edit mode saves the changes, create mode publishes the project */}
        {step === "review" && (editing || persist) && (
          <section>
            <StepIntro
              title={editing ? m.review.saveTitle : m.review.publishTitle}
              body={editing ? m.review.saveBody : m.review.publishBody}
            />

            {fileIssues.length > 0 && (
              <div role="alert" className="mb-6 rounded-2xl border border-need-200 bg-need-50 p-5 text-sm text-need-700">
                <p className="mb-2 font-semibold">{m.review.missing}</p>
                <ul className="list-disc space-y-1 ps-5" dir="ltr">
                  {fileIssues.slice(0, 6).map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            )}

            <dl className="grid gap-4 rounded-3xl border border-line bg-white/70 p-6 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-ink-3">{m.review.project}</dt>
                <dd className="font-display text-xl font-semibold text-leaf-900">{draft.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-3">{m.review.needs}</dt>
                <dd className="font-display text-xl font-semibold text-need-700">{previewProject.current_needs.length}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-3">{m.review.offers}</dt>
                <dd className="font-display text-xl font-semibold text-offer-700">{previewProject.offers.length}</dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={editing ? saveEdits : publish} disabled={saving_ || fileIssues.length > 0}>
                {saving_ ? <Loader2 className="animate-spin" /> : editing ? <Save /> : <Sprout />}
                {editing ? (saving_ ? m.review.saving : m.review.save) : saving_ ? m.review.publishing : m.review.publish}
              </Button>
              {editing && (
                <Link href={doneLink} className={buttonVariants({ variant: "ghost", size: "lg" })}>
                  {m.review.cancel}
                </Link>
              )}
            </div>
            {!editing && !signedIn && <Hint>{m.review.signInNote}</Hint>}
            {saveState && (
              <p role={saveState.ok ? "status" : "alert"} className={cn("mt-4 text-sm font-medium", saveState.ok ? "text-leaf-700" : "text-need-700")}>
                {saveState.text}
              </p>
            )}
          </section>
        )}

        {/* 7 · REVIEW — demo mode only (no database): a JSON file for the seed data */}
        {step === "review" && !editing && !persist && (
          <section>
            <StepIntro title={m.demo.title} body={m.demo.body} />

            {fileIssues.length > 0 && (
              <div role="alert" className="mb-6 rounded-2xl border border-need-200 bg-need-50 p-5 text-sm text-need-700">
                <p className="mb-2 font-semibold">{m.review.missing}</p>
                <ul className="list-disc space-y-1 ps-5" dir="ltr">
                  {fileIssues.slice(0, 6).map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-hidden rounded-3xl border border-line-2 bg-leaf-900 shadow-lift">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-xs text-white/60" dir="ltr">
                <span className="font-mono">data/projects/{slug}.json</span>
                <span>{fmt(m.demo.lines, { n: json.split("\n").length })}</span>
              </div>
              <pre dir="ltr" tabIndex={0} className="max-h-[26rem] overflow-auto p-5 text-start font-mono text-[0.8rem] leading-relaxed text-leaf-100">
                {json}
              </pre>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={download} disabled={fileIssues.length > 0}>
                <Download /> {m.demo.download}
              </Button>
              <Button variant="secondary" size="lg" onClick={copy}>
                {copied ? <Check /> : <Copy />} {copied ? m.demo.copied : m.demo.copy}
              </Button>
              {process.env.NODE_ENV === "development" && (
                <Button variant="soft" size="lg" onClick={saveLocally} disabled={saving || fileIssues.length > 0}>
                  <Save /> {saving ? m.demo.savingLocal : m.demo.saveLocal}
                </Button>
              )}
            </div>
            {process.env.NODE_ENV === "development" && (
              <p className="mt-2 text-xs text-ink-3">{m.demo.devNote}</p>
            )}
            {devMessage && (
              <p role="status" className={cn("mt-4 text-sm font-medium", devMessage.ok ? "text-leaf-700" : "text-need-700")}>
                {devMessage.text}
              </p>
            )}

            <ol className="mt-10 space-y-3 rounded-3xl bg-paper-2/80 p-6 text-[0.95rem] leading-relaxed text-ink-2">
              <li>
                <strong className="text-ink">1.</strong> {m.demo.step1}{" "}
                <code dir="ltr" className="rounded bg-white/80 px-1.5 py-0.5 text-xs">/data/projects/</code>
              </li>
              <li>
                <strong className="text-ink">2.</strong> {m.demo.step2A}{" "}
                <code dir="ltr" className="rounded bg-white/80 px-1.5 py-0.5 text-xs">npm run db:seed</code>
                {m.demo.step2B}{" "}
                <code dir="ltr" className="rounded bg-white/80 px-1.5 py-0.5 text-xs">review_status</code>
                {m.demo.step2To}
                <code dir="ltr" className="rounded bg-white/80 px-1.5 py-0.5 text-xs">pending_review</code> {m.demo.step2C}
              </li>
              <li>
                <strong className="text-ink">3.</strong> {m.demo.step3}
              </li>
            </ol>
          </section>
        )}

        {/* nav */}
        <div className="mt-12 flex items-center justify-between gap-3 border-t border-line-2 pt-6">
          {stepIndex > 0 ? (
            <Button variant="ghost" onClick={back}>
              <PrevArrow /> {m.nav.back}
            </Button>
          ) : (
            <Link href={editing ? doneLink : "/projects"} className={buttonVariants({ variant: "ghost" })}>
              {m.nav.cancel}
            </Link>
          )}
          {!isLast ? (
            <Button size="lg" onClick={next}>
              {m.nav.next} <NextArrow />
            </Button>
          ) : editing ? null : (
            <Button variant="ghost" onClick={() => { setDraft(emptyDraft()); setStepIndex(0); }}>
              {m.nav.restart}
            </Button>
          )}
        </div>
      </div>

      {/* live preview */}
      <aside aria-label={m.preview.aria} className="hidden lg:block">
        <div className="sticky top-28">
          <p className="mb-3 text-xs font-semibold tracking-wide text-ink-3">{m.preview.title}</p>
          <div className="pointer-events-none select-none" aria-hidden="true">
            <ProjectCard project={previewProject} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">{m.preview.note}</p>
        </div>
      </aside>
    </div>
  );
}
