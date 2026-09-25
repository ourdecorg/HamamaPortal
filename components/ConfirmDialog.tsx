"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/**
 * A modal confirmation for destructive actions, on the native <dialog> (focus is trapped, Esc closes).
 * Render it only while it is open (`{open && <ConfirmDialog … />}`), so what was typed is reset every time.
 *
 * The confirm button stays disabled until the explicit confirmation is given: typing `requireText` exactly
 * and/or ticking `requireCheck`. The server checks what matters again — this is for people, not security.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  pending = false,
  error,
  requireText,
  requireTextLabel,
  requireCheck,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Receives what was typed (for `requireText`). */
  onConfirm: (typed: string) => void;
  onClose: () => void;
  pending?: boolean;
  error?: string | null;
  requireText?: string;
  requireTextLabel?: string;
  requireCheck?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const ready = (!requireText || typed.trim() === requireText) && (!requireCheck || checked) && !pending;

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[1.75rem] border border-line bg-paper p-0 text-ink shadow-lift backdrop:bg-leaf-900/40 backdrop:backdrop-blur-sm"
    >
      <form
        method="dialog"
        className="p-6 sm:p-7"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onConfirm(typed);
        }}
      >
        <h2 id={`${id}-title`} className="font-display text-2xl font-semibold leading-snug text-leaf-900">
          {title}
        </h2>
        {children && <div className="mt-3 space-y-2 leading-relaxed text-ink-2">{children}</div>}

        {requireText && (
          <div className="mt-5">
            <label htmlFor={`${id}-typed`} className="mb-2 block text-sm font-medium text-ink">
              {requireTextLabel}
            </label>
            <Input
              id={`${id}-typed`}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="text-start font-mono"
              autoFocus
            />
          </div>
        )}

        {requireCheck && (
          <label className="mt-5 flex items-start gap-3 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 size-4 accent-need-700"
            />
            {requireCheck}
          </label>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-need-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button type="submit" disabled={!ready} className="bg-need-700 shadow-none hover:bg-need-500">
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
