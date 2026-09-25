"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { deleteProject, restoreProject, setProjectState } from "@/app/[lang]/admin/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/field";
import { fmt } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";

type Review = Project["portal"]["review_status"];
type Visibility = Project["portal"]["visibility"];

/** Publication state, deletion and restore of one project. Every action is re-checked on the server and in the database. */
export function AdminProjectPanel({
  projectId,
  slug,
  name,
  review,
  visibility,
  deletedOn,
}: {
  projectId: string;
  slug: string;
  name: string;
  review: Review;
  visibility: Visibility;
  /** The (formatted) date the project was deleted, or null. */
  deletedOn: string | null;
}) {
  const router = useRouter();
  const locale = useLocale();
  const messages = useMessages();
  const m = messages.admin.project;
  const labels = messages.admin.projects;

  const [state, setState] = useState({ review, visibility });
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const changed = state.review !== review || state.visibility !== visibility;

  function saveState() {
    setNotice(null);
    start(async () => {
      const res = await setProjectState(projectId, state.review, state.visibility, locale);
      setNotice(res.status === "ok" ? { ok: true, text: m.saved } : { ok: false, text: res.error });
      if (res.status === "ok") router.refresh();
    });
  }

  function remove(typed: string) {
    setDialogError(null);
    start(async () => {
      const res = await deleteProject(projectId, typed, locale);
      if (res.status === "ok") {
        setConfirming(false);
        router.refresh();
      } else {
        setDialogError(res.error);
      }
    });
  }

  function restore() {
    setNotice(null);
    start(async () => {
      const res = await restoreProject(projectId, locale);
      setNotice(res.status === "ok" ? { ok: true, text: m.restored } : { ok: false, text: res.error });
      if (res.status === "ok") router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {deletedOn && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-need-200 bg-need-50 p-6 lg:col-span-2">
          <p className="font-medium text-need-700">{fmt(m.deletedNotice, { date: deletedOn })}</p>
          <Button onClick={restore} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />} {m.restore}
          </Button>
        </div>
      )}

      <section aria-labelledby="state-title" className="rounded-3xl border border-line bg-white/70 p-6">
        <h2 id="state-title" className="font-display text-2xl font-semibold text-leaf-900">
          {m.stateTitle}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{m.stateBody}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="review">{labels.review}</Label>
            <Select id="review" value={state.review} onChange={(e) => setState((s) => ({ ...s, review: e.target.value as Review }))}>
              {(["published", "pending_review", "draft"] as const).map((r) => (
                <option key={r} value={r}>
                  {labels.reviewStatus[r]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="visibility">{labels.visibility}</Label>
            <Select id="visibility" value={state.visibility} onChange={(e) => setState((s) => ({ ...s, visibility: e.target.value as Visibility }))}>
              {(["public", "unlisted", "private"] as const).map((v) => (
                <option key={v} value={v}>
                  {labels.visibilityStatus[v]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Button className="mt-5" onClick={saveState} disabled={!changed || pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} {pending ? m.saving : m.save}
        </Button>
        {notice && (
          <p role={notice.ok ? "status" : "alert"} className={cn("mt-3 text-sm font-medium", notice.ok ? "text-leaf-700" : "text-need-700")}>
            {notice.text}
          </p>
        )}
      </section>

      {!deletedOn && (
        <section aria-labelledby="delete-title" className="rounded-3xl border border-need-200 bg-need-50/50 p-6">
          <h2 id="delete-title" className="font-display text-2xl font-semibold text-need-700">
            {m.deleteTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{m.deleteBody}</p>
          <Button variant="secondary" className="mt-5 border-need-200 text-need-700 hover:border-need-400 hover:text-need-700" onClick={() => { setDialogError(null); setConfirming(true); }}>
            <Trash2 /> {m.delete}
          </Button>
        </section>
      )}

      {confirming && (
        <ConfirmDialog
          title={fmt(m.confirmDeleteTitle, { name })}
          confirmLabel={m.confirmDelete}
          cancelLabel={messages.admin.cancel}
          requireText={slug}
          requireTextLabel={fmt(m.typeSlug, { slug })}
          pending={pending}
          error={dialogError}
          onConfirm={remove}
          onClose={() => setConfirming(false)}
        >
          <p>{fmt(m.confirmDeleteBody, { slug })}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
