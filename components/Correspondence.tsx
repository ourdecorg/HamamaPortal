"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { ConversationDialog } from "@/components/ConversationDialog";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import type { ConversationSummary } from "@/lib/conversation";
import { LOCALE_META } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/format";
import { t } from "@/lib/locale";
import { cn } from "@/lib/utils";

/**
 * My Space → my correspondence: every email and chat conversation, newest first. A row opens the same window as
 * on the project page, with the whole history. `?conversation=<id>` (the link in emails) opens one directly.
 */
export function Correspondence({ conversations, initialOpen }: { conversations: ConversationSummary[]; initialOpen?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const m = useMessages().mySpace.correspondence;
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);

  function close() {
    setOpen(null);
    // Drop ?conversation= from the address, and re-read the list (unread marks, last messages).
    if (initialOpen) router.replace(pathname, { scroll: false });
    router.refresh();
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(LOCALE_META[locale].dateLocale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <ul className="space-y-3">
        {conversations.map((c) => {
          const Icon = c.kind === "chat" ? MessageCircle : Mail;
          const other = c.other_name ?? "—";
          const project = c.project_name ? t(c.project_name, locale) : null;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpen(c.id)}
                aria-label={fmt(m.open, { name: other })}
                className={cn(
                  "flex w-full items-start gap-4 rounded-2xl border p-5 text-start shadow-soft transition-colors hover:border-leaf-300",
                  c.unread ? "border-leaf-300 bg-leaf-50/70" : "border-line bg-white/80",
                )}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-leaf-100 text-leaf-800" aria-hidden="true">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-display text-lg font-semibold text-leaf-900">{other}</span>
                    <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs font-medium text-ink-2">{c.kind === "chat" ? m.chat : m.email}</span>
                    {c.unread && <span className="rounded-full bg-sun/25 px-2 py-0.5 text-xs font-semibold text-need-700">{m.unread}</span>}
                    <span className="ms-auto text-xs text-ink-3">{when(c.last_at)}</span>
                  </span>
                  {(project || c.subject) && (
                    <span className="mt-0.5 block truncate text-sm text-ink-2">
                      {project && fmt(m.about, { name: project })}
                      {project && c.subject && " · "}
                      {c.subject && <span dir="auto">{c.subject}</span>}
                    </span>
                  )}
                  {c.last_body && (
                    <span dir="auto" className={cn("mt-1.5 line-clamp-2 block text-sm leading-relaxed", c.unread ? "font-medium text-ink" : "text-ink-3")}>
                      {c.last_from_me && m.you}
                      {c.last_body}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && <ConversationDialog conversationId={open} returnTo={`/my-space?conversation=${open}`} onClose={close} />}
    </>
  );
}
