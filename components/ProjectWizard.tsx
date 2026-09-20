"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, CircleDashed, Copy, Download, Gift, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { saveProjectEdits } from "@/app/projects/actions";
import { ProjectCard } from "@/components/ProjectCard";
import { TypeIcon } from "@/components/TypeIcon";
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
  STEPS,
  buildProject,
  buildProjectFile,
  emptyDraft,
  newItem,
  slugify,
  validateFile,
  validateStep,
  type Draft,
  type ItemDraft,
  type StepId,
} from "@/lib/wizard";
import { loginUrl } from "@/lib/next-path";
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
      <h2 className="font-display text-3xl font-bold leading-tight text-leaf-900 sm:text-4xl">{title}</h2>
      <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-2">{body}</p>
    </div>
  );
}

// -------------------------------------------------------- need / offer list --

const NEED_STATUS_LABEL: Record<Need["status"], string> = { open: "פתוח", in_conversation: "בשיחה", fulfilled: "נענה" };

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

  return (
    <fieldset
      className={cn(
        "rounded-[1.75rem] border p-5 sm:p-6",
        isNeed ? "border-dashed border-need-400/70 bg-need-50/60" : "border-offer-400/50 bg-offer-50/60",
      )}
    >
      <legend className={cn("flex items-center gap-2 px-2 text-sm font-semibold", isNeed ? "text-need-700" : "text-offer-700")}>
        <Icon className="size-4" aria-hidden="true" />
        {isNeed ? "צורך" : "הצעה"} {index + 1}
      </legend>

      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-ink">איזה סוג?</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(EXCHANGE_TYPES).map(([key, info]) => (
              <ToggleChip key={key} active={item.type === key} tone={kind} onClick={() => onChange({ type: key })}>
                <TypeIcon type={key} className="size-3.5" />
                {info.he}
              </ToggleChip>
            ))}
          </div>
        </div>

        {showStatus && isNeed && (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">מצב הצורך</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(NEED_STATUS_LABEL) as Need["status"][]).map((st) => (
                <ToggleChip key={st} tone="need" active={(item.status ?? "open") === st} onClick={() => onChange({ status: st })}>
                  {NEED_STATUS_LABEL[st]}
                </ToggleChip>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label htmlFor={`${item.uid}-title`}>{isNeed ? "מה מחפשים — במשפט קצר?" : "מה מציעים — במשפט קצר?"}</Label>
          <Input
            id={`${item.uid}-title`}
            value={item.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder={isNeed ? "למשל: קבוצה של 30 אנשים לפיילוט" : "למשל: גישה לשלוש קבוצות שכנים"}
          />
        </div>

        <div>
          <Label htmlFor={`${item.uid}-desc`}>קצת יותר פירוט</Label>
          <Textarea
            id={`${item.uid}-desc`}
            rows={3}
            value={item.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder={isNeed ? "מה בדיוק חסר, ולמה זה חשוב עכשיו?" : "מה בדיוק אפשר לקבל, ובאילו תנאים?"}
          />
        </div>

        {showKeywords ? (
          <div>
            <Label htmlFor={`${item.uid}-kw`} hint="(אופציונלי)">
              מילות מפתח, מופרדות בפסיק
            </Label>
            <Input
              id={`${item.uid}-kw`}
              value={item.keywords}
              onChange={(e) => onChange({ keywords: e.target.value })}
              placeholder="neighbors, pilot, tool"
              dir="ltr"
            />
            <Hint>מילות מפתח עוזרות למערכת לזהות חיבורים מדויקים יותר. עדיף אנגלית — כך אפשר להתאים בין מיזמים בשפות שונות.</Hint>
          </div>
        ) : (
          <button type="button" onClick={() => setShowKeywords(true)} className="text-sm font-medium text-ink-2 underline-offset-4 hover:text-leaf-700 hover:underline">
            הוספת מילות מפתח (לא חובה)
          </button>
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 /> הסרה
        </Button>
      </div>
    </fieldset>
  );
}

// ----------------------------------------------------------------- wizard ----

interface ProjectWizardProps {
  /** "create": the original flow (JSON preview / download). "edit": a steward updating a stored project. */
  mode?: "create" | "edit";
  initialDraft?: Draft;
  /** Edit mode: the project being edited. Its slug (and so its URL) cannot change. */
  slug?: string;
}

export function ProjectWizard({ mode = "create", initialDraft, slug: editSlug }: ProjectWizardProps) {
  const editing = mode === "edit" && Boolean(editSlug);
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initialDraft ?? emptyDraft);
  const [saveState, setSaveState] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving_, startSaving] = useTransition();
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [devMessage, setDevMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const step: StepId = STEPS[stepIndex].id;
  const isLast = stepIndex === STEPS.length - 1;

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const patchItem = (kind: "needs" | "offers", uid: string, p: Partial<ItemDraft>) =>
    setDraft((d) => ({ ...d, [kind]: d[kind].map((it) => (it.uid === uid ? { ...it, ...p } : it)) }));

  const previewProject = useMemo(() => buildProject(draft, true), [draft]);
  const file = useMemo(() => buildProjectFile(draft), [draft]);
  const fileIssues = useMemo(() => (isLast ? validateFile(file) : []), [file, isLast]);
  const json = useMemo(() => JSON.stringify(file, null, 2), [file]);
  const slug = editing ? editSlug! : draft.slug || slugify(draft.name);

  function saveEdits() {
    setSaveState(null);
    startSaving(async () => {
      const res = await saveProjectEdits(editSlug!, draft);
      if (res.status === "saved") {
        router.push(`/projects/${editSlug}`);
        router.refresh();
      } else if (res.status === "auth_required") {
        router.push(loginUrl(`/projects/${editSlug}/edit`));
      } else if (res.status === "forbidden") {
        setSaveState({ ok: false, text: "אין לכם הרשאה לערוך את המיזם הזה. ההרשאה ניתנת אחרי אישור בקשת הטיפוח." });
      } else {
        setSaveState({ ok: false, text: res.error });
      }
    });
  }

  function next() {
    const found = validateStep(step, draft);
    setErrors(found);
    if (Object.keys(found).length === 0) {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
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
      const body = (await res.json()) as { file?: string; error?: string };
      setDevMessage(
        res.ok
          ? { ok: true, text: `נשמר ב-${body.file}. כדי שהמיזם יופיע בפורטל, הריצו npm run db:seed.` }
          : { ok: false, text: body.error ?? "השמירה נכשלה." },
      );
    } catch {
      setDevMessage({ ok: false, text: "השמירה נכשלה." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-16">
      <div>
        {/* progress */}
        <nav aria-label="שלבי ההוספה" className="mb-10">
          <ol className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex flex-1 items-center gap-2 last:flex-none">
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
                {i < STEPS.length - 1 && (
                  <span className={cn("h-0.5 flex-1 rounded-full", i < stepIndex ? "bg-leaf-500" : "bg-line-2")} aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm font-medium text-ink-2">
            שלב {stepIndex + 1} מתוך {STEPS.length} · {STEPS[stepIndex].label}
          </p>
        </nav>

        {/* 1 · IDENTITY */}
        {step === "identity" && (
          <section>
            <StepIntro title="נתחיל מהכרות" body="איך קוראים למיזם, ובמשפט אחד — מה הוא עושה?" />
            <div className="space-y-7">
              <div>
                <Label htmlFor="name">שם המיזם</Label>
                <Input
                  id="name"
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value, ...(draft.slugTouched ? {} : { slug: slugify(e.target.value) }) })}
                  placeholder="למשל: שכנים לומדים"
                  autoFocus
                />
                <FieldError message={errors.name} />
              </div>
              <div>
                <Label htmlFor="tagline">משפט אחד</Label>
                <Input
                  id="tagline"
                  value={draft.tagline}
                  onChange={(e) => patch({ tagline: e.target.value })}
                  placeholder="למשל: כל שכונה מלאה במורים. רק צריך לגלות מי הם."
                />
                <FieldError message={errors.tagline} />
              </div>
              <div>
                <Label htmlFor="short_description">תיאור קצר</Label>
                <Textarea
                  id="short_description"
                  rows={4}
                  value={draft.short_description}
                  onChange={(e) => patch({ short_description: e.target.value })}
                  placeholder="שלושה־ארבעה משפטים: מה עושים, עם מי, ואיך זה נראה בפועל."
                />
                <FieldError message={errors.short_description} />
              </div>
              <div>
                <Label htmlFor="slug" hint={editing ? "(לא ניתן לשינוי)" : "(משמש בכתובת ובשם הקובץ)"}>
                  מזהה באנגלית
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
                  {editing ? "הכתובת של המיזם נשארת כפי שהיא, כדי שקישורים קיימים ימשיכו לעבוד: " : "הכתובת תהיה "}
                  <span dir="ltr" className="font-mono text-ink-2">/projects/{slug}</span>
                </Hint>
                <FieldError message={errors.slug} />
              </div>
            </div>
          </section>
        )}

        {/* 2 · INTENT */}
        {step === "intent" && (
          <section>
            <StepIntro title="למה המיזם קיים?" body="כאן הסיפור. אנשים מתחברים לכוונה, לא רק לתיאור." />
            <div className="space-y-7">
              <div>
                <Label htmlFor="vision">איזה עולם אתם רוצים לראות?</Label>
                <Textarea
                  id="vision"
                  rows={3}
                  value={draft.vision}
                  onChange={(e) => patch({ vision: e.target.value })}
                  placeholder="תארו את העתיד כאילו הוא כבר קרה."
                  autoFocus
                />
                <FieldError message={errors.vision} />
              </div>
              <div>
                <Label htmlFor="problem">מה לא עובד היום?</Label>
                <Textarea
                  id="problem"
                  rows={3}
                  value={draft.problem}
                  onChange={(e) => patch({ problem: e.target.value })}
                  placeholder="הבעיה המרכזית שאתם רואים."
                />
                <FieldError message={errors.problem} />
              </div>
              <div>
                <Label htmlFor="desired_change">איזה שינוי אתם רוצים ליצור?</Label>
                <Textarea
                  id="desired_change"
                  rows={3}
                  value={draft.desired_change}
                  onChange={(e) => patch({ desired_change: e.target.value })}
                  placeholder="במשפט או שניים: מה יהיה שונה אם תצליחו?"
                />
                <FieldError message={errors.desired_change} />
              </div>
            </div>
          </section>
        )}

        {/* 3 · NEEDS */}
        {step === "needs" && (
          <section>
            <StepIntro
              title="מה אתם צריכים עכשיו?"
              body="צורך טוב הוא ספציפי: 'קבוצה של 30 אנשים לפיילוט' ולא 'עזרה'. אפשר להוסיף כמה שרוצים, או לדלג אם אין כרגע."
            />
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
                  אין צרכים כרגע. זה בסדר — אפשר להוסיף אחר כך.
                </p>
              )}
              {draft.needs.length < 5 && (
                <Button variant="secondary" onClick={() => patch({ needs: [...draft.needs, newItem("community")] })}>
                  <Plus /> הוספת צורך
                </Button>
              )}
            </div>
          </section>
        )}

        {/* 4 · OFFERS */}
        {step === "offers" && (
          <section>
            <StepIntro
              title="מה אתם יכולים להציע?"
              body="לכל מיזם יש משהו לתת: ידע, קהילה, כלי, מקום, זמן. גם דבר קטן יכול להיות בדיוק מה שמישהו אחר מחפש."
            />
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
                  אין הצעות כרגע. אפשר לחזור לכאן בכל שלב.
                </p>
              )}
              {draft.offers.length < 5 && (
                <Button variant="secondary" onClick={() => patch({ offers: [...draft.offers, newItem("knowledge")] })}>
                  <Plus /> הוספת הצעה
                </Button>
              )}
            </div>
          </section>
        )}

        {/* 5 · DETAILS */}
        {step === "details" && (
          <section>
            <StepIntro title="עוד כמה פרטים" body="תחום, שלב וקישורים. מה שלא רלוונטי — אפשר להשאיר ריק." />
            <div className="space-y-9">
              <fieldset>
                <legend className="mb-2.5 text-sm font-medium text-ink">בחרו תחום (או כמה)</legend>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(DOMAINS).map(([key, info]) => (
                    <ToggleChip
                      key={key}
                      active={draft.domains.includes(key)}
                      onClick={() =>
                        patch({ domains: draft.domains.includes(key) ? draft.domains.filter((d) => d !== key) : [...draft.domains, key] })
                      }
                    >
                      {info.he}
                    </ToggleChip>
                  ))}
                </div>
                <FieldError message={errors.domains} />
              </fieldset>

              <fieldset>
                <legend className="mb-2.5 text-sm font-medium text-ink">באיזה שלב אתם?</legend>
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
                      <span className="block font-medium text-ink">{LIFECYCLE_STAGES[s].he}</span>
                      <span className="text-sm text-ink-3">{LIFECYCLE_STAGES[s].hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-7 sm:grid-cols-2">
                <fieldset>
                  <legend className="mb-2.5 text-sm font-medium text-ink">מצב פעילות</legend>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(ACTIVITY_STATUS) as (keyof typeof ACTIVITY_STATUS)[]).map((a) => (
                      <ToggleChip key={a} active={draft.activity === a} onClick={() => patch({ activity: a })}>
                        {ACTIVITY_STATUS[a].he}
                      </ToggleChip>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2.5 text-sm font-medium text-ink">היקף פעילות</legend>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(GEOGRAPHY_SCOPES) as GeographyScope[]).map((s) => (
                      <ToggleChip key={s} active={draft.scope === s} onClick={() => patch({ scope: draft.scope === s ? "" : s })}>
                        {GEOGRAPHY_SCOPES[s].he}
                      </ToggleChip>
                    ))}
                  </div>
                  {draft.scope && (
                    <Input className="mt-3" value={draft.place} onChange={(e) => patch({ place: e.target.value })} placeholder="איפה? (עיר, אזור — אופציונלי)" aria-label="מקום" />
                  )}
                </fieldset>
              </div>

              <fieldset>
                <legend className="mb-1 text-sm font-medium text-ink">איך אתם אוהבים לשתף פעולה?</legend>
                <Hint>עוזר לזהות חיבורים עם מי שעובד בסגנון דומה.</Hint>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(COLLAB_TYPES).map(([key, info]) => (
                    <ToggleChip
                      key={key}
                      active={draft.collab.includes(key)}
                      onClick={() => patch({ collab: draft.collab.includes(key) ? draft.collab.filter((c) => c !== key) : [...draft.collab, key] })}
                    >
                      {info.he}
                    </ToggleChip>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label htmlFor="steward">מי מטפח את המיזם?</Label>
                  <Input id="steward" value={draft.steward_name} onChange={(e) => patch({ steward_name: e.target.value })} placeholder="שם" />
                </div>
                <div>
                  <Label htmlFor="steward-role">תפקיד</Label>
                  <Input id="steward-role" value={draft.steward_role} onChange={(e) => patch({ steward_role: e.target.value })} placeholder="למשל: מייסדת" />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-3">
                {(
                  [
                    ["website", "אתר"],
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

        {/* 6 · REVIEW — edit mode: save to the portal */}
        {step === "review" && editing && (
          <section>
            <StepIntro
              title="מוכנים לשמור?"
              body="השינויים יופיעו בדף המיזם מיד, והחיבורים יחושבו מחדש לפי הצרכים וההצעות המעודכנים."
            />

            {fileIssues.length > 0 && (
              <div role="alert" className="mb-6 rounded-2xl border border-need-200 bg-need-50 p-5 text-sm text-need-700">
                <p className="mb-2 font-semibold">כמה דברים חסרים לפני שאפשר לשמור:</p>
                <ul className="list-disc space-y-1 ps-5" dir="ltr">
                  {fileIssues.slice(0, 6).map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            )}

            <dl className="grid gap-4 rounded-3xl border border-line bg-white/70 p-6 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-ink-3">מיזם</dt>
                <dd className="font-display text-xl font-bold text-leaf-900">{draft.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-3">צרכים</dt>
                <dd className="font-display text-xl font-bold text-need-700">{previewProject.current_needs.length}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-3">הצעות</dt>
                <dd className="font-display text-xl font-bold text-offer-700">{previewProject.offers.length}</dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={saveEdits} disabled={saving_ || fileIssues.length > 0}>
                {saving_ ? <Loader2 className="animate-spin" /> : <Save />}
                {saving_ ? "שומר…" : "שמירת שינויים"}
              </Button>
              <Link href={`/projects/${editSlug}`} className={buttonVariants({ variant: "ghost", size: "lg" })}>
                ביטול
              </Link>
            </div>
            {saveState && (
              <p role={saveState.ok ? "status" : "alert"} className={cn("mt-4 text-sm font-medium", saveState.ok ? "text-leaf-700" : "text-need-700")}>
                {saveState.text}
              </p>
            )}
          </section>
        )}

        {/* 6 · REVIEW — create mode: a JSON file for the seed data */}
        {step === "review" && !editing && (
          <section>
            <StepIntro
              title="הנה המיזם שלכם"
              body="הכלי הזה מכין קובץ JSON. הורידו אותו והניחו בתיקייה — מנהל/ת המערכת מייבא/ת אותו לפורטל."
            />

            {fileIssues.length > 0 && (
              <div role="alert" className="mb-6 rounded-2xl border border-need-200 bg-need-50 p-5 text-sm text-need-700">
                <p className="mb-2 font-semibold">כמה דברים חסרים לפני שאפשר לשמור:</p>
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
                <span>{json.split("\n").length} lines</span>
              </div>
              <pre dir="ltr" tabIndex={0} className="max-h-[26rem] overflow-auto p-5 text-start font-mono text-[0.8rem] leading-relaxed text-leaf-100">
                {json}
              </pre>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={download} disabled={fileIssues.length > 0}>
                <Download /> Download JSON
              </Button>
              <Button variant="secondary" size="lg" onClick={copy}>
                {copied ? <Check /> : <Copy />} {copied ? "הועתק" : "העתקה"}
              </Button>
              {process.env.NODE_ENV === "development" && (
                <Button variant="soft" size="lg" onClick={saveLocally} disabled={saving || fileIssues.length > 0}>
                  <Save /> {saving ? "שומר…" : "שמירה בתיקיית הפרויקט"}
                </Button>
              )}
            </div>
            {process.env.NODE_ENV === "development" && (
              <p className="mt-2 text-xs text-ink-3">כפתור השמירה מופיע רק בפיתוח מקומי, ורק ממחשב זה.</p>
            )}
            {devMessage && (
              <p role="status" className={cn("mt-4 text-sm font-medium", devMessage.ok ? "text-leaf-700" : "text-need-700")}>
                {devMessage.text}
              </p>
            )}

            <ol className="mt-10 space-y-3 rounded-3xl bg-paper-2/80 p-6 text-[0.95rem] leading-relaxed text-ink-2">
              <li>
                <strong className="text-ink">1.</strong> הניחו את הקובץ בתיקייה{" "}
                <code dir="ltr" className="rounded bg-white/80 px-1.5 py-0.5 text-xs">/data/projects/</code>
              </li>
              <li>
                <strong className="text-ink">2.</strong> ייבאו אותו למסד הנתונים עם{" "}
                <code dir="ltr" className="rounded bg-white/80 px-1.5 py-0.5 text-xs">npm run db:seed</code>. אפשר לערוך את הקובץ קודם, ולשנות{" "}
                <code dir="ltr" className="rounded bg-white/80 px-1.5 py-0.5 text-xs">review_status</code> ל-<code dir="ltr" className="rounded bg-white/80 px-1.5 py-0.5 text-xs">pending_review</code> כדי שהמיזם לא יופיע עדיין.
              </li>
              <li>
                <strong className="text-ink">3.</strong> חממה תזהה את הצרכים וההצעות שלכם ותציע חיבורים.
              </li>
            </ol>
          </section>
        )}

        {/* nav */}
        <div className="mt-12 flex items-center justify-between gap-3 border-t border-line-2 pt-6">
          {stepIndex > 0 ? (
            <Button variant="ghost" onClick={back}>
              <ArrowRight /> הקודם
            </Button>
          ) : (
            <Link href={editing ? `/projects/${editSlug}` : "/projects"} className={buttonVariants({ variant: "ghost" })}>
              ביטול
            </Link>
          )}
          {!isLast ? (
            <Button size="lg" onClick={next}>
              הבא <ArrowLeft />
            </Button>
          ) : editing ? null : (
            <Button variant="ghost" onClick={() => { setDraft(emptyDraft()); setStepIndex(0); }}>
              להתחיל מחדש
            </Button>
          )}
        </div>
      </div>

      {/* live preview */}
      <aside aria-label="תצוגה מקדימה" className="hidden lg:block">
        <div className="sticky top-28">
          <p className="mb-3 text-xs font-semibold tracking-wide text-ink-3">כך המיזם ייראה בפורטל</p>
          <div className="pointer-events-none select-none" aria-hidden="true">
            <ProjectCard project={previewProject} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">התצוגה מתעדכנת תוך כדי הקלדה.</p>
        </div>
      </aside>
    </div>
  );
}
