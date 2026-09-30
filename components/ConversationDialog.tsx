"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { Bell, BellOff, Loader2, Mail, MessageCircle, Send, X } from "lucide-react";
import {
  findConversation,
  loadConversation,
  sendMessage,
  setConversationMuted,
  startConversation,
} from "@/app/[lang]/contact/actions";
import { Link } from "@/components/LocaleLink";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import type { ContactError, ContactTarget, ConversationKind, ConversationMessage, ConversationView } from "@/lib/conversation";
import { LOCALE_META } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/format";
import { t } from "@/lib/locale";
import { loginUrl } from "@/lib/next-path";
import { cn } from "@/lib/utils";

/** How often an open conversation asks for new messages. */
const POLL_MS = 5000;

type Props = {
  onClose: () => void;
  /** Where to come back to after signing in, if the session ran out. */
  returnTo: string;
} & (
  | { conversationId: string; target?: undefined; kind?: undefined }
  | { conversationId?: undefined; target: ContactTarget; kind: ConversationKind }
);

type Phase = "loading" | "compose" | "thread" | "notFound";

/**
 * One conversation — email or chat — in a modal on the native <dialog> (focus stays inside, Esc closes).
 * Render it only while it is open. The same window serves the project page (write to a team member: a new
 * email, a new chat, or the conversation you already have with them) and My Space (continue any conversation).
 *
 * While open it asks the server for new messages every few seconds (only when the tab is visible).
 */
export function ConversationDialog(props: Props) {
  const { onClose, returnTo } = props;
  const router = useRouter();
  const locale = useLocale();
  const messages = useMessages();
  const m = messages.contact;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const [phase, setPhase] = useState<Phase>("loading");
  const [conversationId, setConversationId] = useState<string | null>(props.conversationId ?? null);
  const [view, setView] = useState<ConversationView | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const kind: ConversationKind = view?.kind ?? props.kind ?? "email";
  const Icon = kind === "chat" ? MessageCircle : Mail;
  const others = view?.participants.filter((p) => !p.is_me).map((p) => p.name).join(", ");
  const name = others || props.target?.personName || "";
  const title =
    phase === "compose" && kind === "email"
      ? fmt(m.compose.title, { name })
      : kind === "chat"
        ? fmt(m.chat.title, { name })
        : fmt(m.thread.emailTitle, { name });
  const projectName = view?.project ? t(view.project.name, locale) : props.target?.projectName;
  const projectSlug = view?.project?.slug;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const errorText = useCallback((e: ContactError) => m.errors[e], [m.errors]);
  const signIn = useCallback(() => router.push(loginUrl(returnTo, locale)), [router, returnTo, locale]);

  /** Load the whole conversation (first time) — or, with `since`, append what is new. */
  const refresh = useCallback(async (cid: string, since?: string) => {
    const next = await loadConversation(cid, since);
    if (!next) return false;
    setView((prev) => {
      if (!since || !prev) return next;
      const known = new Set(prev.messages.map((msg) => msg.id));
      const added = next.messages.filter((msg) => !known.has(msg.id));
      return { ...next, messages: added.length ? [...prev.messages, ...added] : prev.messages };
    });
    return true;
  }, []);

  // Open: a known conversation, the one you already have with this person, or a new one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cid = props.conversationId ?? (props.target ? await findConversation(props.target.projectId, props.target.personId, props.kind) : null);
      if (cancelled) return;
      if (!cid) {
        setPhase(props.conversationId ? "notFound" : "compose");
        return;
      }
      setConversationId(cid);
      const found = await refresh(cid);
      if (!cancelled) setPhase(found ? "thread" : "notFound");
    })();
    return () => {
      cancelled = true;
    };
    // Runs once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for new messages while the conversation is open and the tab is visible.
  const lastAt = view?.messages.at(-1)?.at;
  useEffect(() => {
    if (phase !== "thread" || !conversationId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(conversationId, lastAt);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [phase, conversationId, lastAt, refresh]);

  // Keep the newest message in view.
  const count = view?.messages.length ?? 0;
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [count, phase]);

  function send() {
    const text = body.trim();
    if (!text || pending) return;
    if (phase === "compose" && kind === "email" && !subject.trim()) {
      setError(m.errors.invalid);
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      if (!conversationId && props.target) {
        const res = await startConversation(
          { projectId: props.target.projectId, personId: props.target.personId, kind, subject: subject.trim(), body: text },
          locale,
        ).catch(() => ({ status: "error", error: "failed" }) as const);
        if (res.status === "auth_required") return signIn();
        if (res.status === "error") return setError(errorText(res.error));
        setBody("");
        setConversationId(res.conversationId);
        await refresh(res.conversationId);
        setPhase("thread");
        if (kind === "email") setNotice(m.thread.sentByEmail);
        return;
      }
      if (!conversationId) return;
      const res = await sendMessage(conversationId, text, locale).catch(() => ({ status: "error", error: "failed" }) as const);
      if (res.status === "auth_required") return signIn();
      if (res.status === "error") return setError(errorText(res.error));
      setBody("");
      await refresh(conversationId, lastAt);
    });
  }

  function toggleMuted() {
    if (!conversationId || !view) return;
    const muted = !view.muted;
    startTransition(async () => {
      if (await setConversationMuted(conversationId, muted)) setView((v) => (v ? { ...v, muted } : v));
    });
  }

  const byId = new Map(view?.participants.map((p) => [p.id, p]) ?? []);
  const when = (iso: string) =>
    new Date(iso).toLocaleString(LOCALE_META[locale].dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  function bubble(message: ConversationMessage) {
    const mine = message.from === view?.me;
    const author = mine ? m.thread.you : (byId.get(message.from ?? "")?.name ?? "—");
    return (
      <li key={message.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
        <div
          dir="auto"
          className={cn(
            "max-w-[85%] whitespace-pre-line break-words rounded-2xl px-4 py-2.5 leading-relaxed",
            mine ? "rounded-ee-md bg-leaf-700 text-white" : "rounded-es-md border border-line bg-white text-ink",
          )}
        >
          {message.body}
        </div>
        <span className="mt-1 px-1 text-xs text-ink-3">
          {author} · {when(message.at)}
          {message.via === "email" && !mine && ` · ${m.thread.viaEmail}`}
        </span>
      </li>
    );
  }

  const composer = (
    <form
      className="border-t border-line bg-paper px-5 py-4 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label htmlFor={`${id}-body`} className="sr-only">
        {kind === "chat" ? m.thread.messagePh : m.thread.replyPh}
      </label>
      <div className="flex items-end gap-3">
        <Textarea
          id={`${id}-body`}
          dir="auto"
          rows={kind === "chat" ? 2 : 3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (kind === "chat" && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={kind === "chat" ? m.thread.messagePh : m.thread.replyPh}
          maxLength={5000}
          readOnly={pending}
          className="min-h-0 flex-1 resize-none"
          autoFocus
        />
        <Button type="submit" disabled={pending || !body.trim()} aria-label={m.thread.send} className="shrink-0">
          {pending ? <Loader2 className="animate-spin" /> : <Send className="rtl:-scale-x-100" />}
          <span className="hidden sm:inline">{pending ? m.thread.sending : m.thread.send}</span>
        </Button>
      </div>
      {kind === "chat" && <p className="mt-1.5 hidden text-xs text-ink-3 sm:block">{m.thread.enterHint}</p>}
    </form>
  );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[min(44rem,calc(100dvh-2rem))] w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.75rem] border border-line bg-paper p-0 text-ink shadow-lift backdrop:bg-leaf-900/40 backdrop:backdrop-blur-sm open:flex"
    >
      {/* header */}
      <div className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-leaf-100 text-leaf-800" aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="font-display text-2xl font-semibold leading-snug text-leaf-900">
            {title}
          </h2>
          {projectName && (
            <p className="mt-0.5 truncate text-sm text-ink-2">
              {projectSlug ? (
                <Link href={`/projects/${projectSlug}`} className="underline-offset-4 hover:text-leaf-700 hover:underline">
                  {fmt(m.thread.about, { name: projectName })}
                </Link>
              ) : (
                fmt(m.thread.about, { name: projectName })
              )}
            </p>
          )}
          {view?.kind === "email" && view.subject && (
            <p dir="auto" className="mt-1 truncate text-sm font-medium text-ink">
              {view.subject}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={m.thread.close} className="-me-2 size-9 shrink-0 px-0">
          <X />
        </Button>
      </div>

      {/* body */}
      {phase === "loading" && (
        <p role="status" className="flex items-center gap-3 px-6 py-10 text-ink-2">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {m.thread.loading}
        </p>
      )}

      {phase === "notFound" && <p className="px-6 py-10 text-ink-2">{m.thread.notFound}</p>}

      {phase === "compose" && kind === "email" && (
        <form
          className="overflow-y-auto px-5 py-5 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <p className="leading-relaxed text-ink-2">{fmt(m.compose.body, { name })}</p>
          <div className="mt-5 space-y-5">
            <div>
              <Label htmlFor={`${id}-subject`}>{m.compose.subject}</Label>
              <Input
                id={`${id}-subject`}
                dir="auto"
                value={subject}
                maxLength={200}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={m.compose.subjectPh}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor={`${id}-message`}>{m.compose.message}</Label>
              <Textarea
                id={`${id}-message`}
                dir="auto"
                rows={7}
                value={body}
                maxLength={5000}
                onChange={(e) => setBody(e.target.value)}
                placeholder={m.compose.messagePh}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="mt-4 text-sm font-medium text-need-700">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              {m.compose.cancel}
            </Button>
            <Button type="submit" disabled={pending || !body.trim() || !subject.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <Send className="rtl:-scale-x-100" />}
              {pending ? m.compose.sending : m.compose.send}
            </Button>
          </div>
        </form>
      )}

      {(phase === "thread" || (phase === "compose" && kind === "chat")) && (
        <>
          <div ref={listRef} className="min-h-40 flex-1 overflow-y-auto bg-paper-2/40 px-5 py-5 sm:px-6" aria-live="polite">
            {view?.messages.length ? (
              <ol className="space-y-4">
                {view.messages.map(bubble)}
              </ol>
            ) : (
              <p className="py-6 text-center text-ink-3">{fmt(m.chat.empty, { name })}</p>
            )}
          </div>
          {(notice || error) && (
            <p
              role={error ? "alert" : "status"}
              className={cn("border-t border-line px-6 py-2.5 text-sm font-medium", error ? "text-need-700" : "text-leaf-700")}
            >
              {error ?? notice}
            </p>
          )}
          {composer}
          {view && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper px-5 py-2 text-xs text-ink-3 sm:px-6">
              <span>{view.muted ? m.thread.mutedNote : ""}</span>
              <button
                type="button"
                onClick={toggleMuted}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-paper-2 hover:text-ink"
              >
                {view.muted ? <Bell className="size-3.5" aria-hidden="true" /> : <BellOff className="size-3.5" aria-hidden="true" />}
                {view.muted ? m.thread.unmute : m.thread.mute}
              </button>
            </div>
          )}
        </>
      )}
    </dialog>
  );
}
