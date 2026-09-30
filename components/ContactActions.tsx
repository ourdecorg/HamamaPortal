"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { ConversationDialog } from "@/components/ConversationDialog";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import type { ContactTarget, ConversationKind } from "@/lib/conversation";
import { fmt } from "@/lib/i18n/format";
import { loginUrl } from "@/lib/next-path";

/**
 * The email / chat buttons next to a person on an initiative's team. A visitor is sent to sign in first and
 * comes back to the same page with the right window open (`?contact=<person>&via=email|chat`).
 */
export function ContactActions({
  target,
  slug,
  email,
  chat,
  signedIn,
  autoOpen,
}: {
  target: ContactTarget;
  slug: string;
  /** Show the email button. */
  email: boolean;
  /** Show the chat button (registered people only). */
  chat: boolean;
  signedIn: boolean;
  /** Back from signing in: open this window right away. */
  autoOpen?: ConversationKind;
}) {
  const router = useRouter();
  const locale = useLocale();
  const m = useMessages().contact;
  const [open, setOpen] = useState<ConversationKind | null>(signedIn ? (autoOpen ?? null) : null);
  const returnTo = (kind: ConversationKind) => `/projects/${slug}?contact=${encodeURIComponent(target.personId)}&via=${kind}#team`;

  function start(kind: ConversationKind) {
    if (!signedIn) {
      router.push(loginUrl(returnTo(kind), locale));
      return;
    }
    setOpen(kind);
  }

  const button =
    "grid size-9 place-items-center rounded-full border border-line-2 bg-white/80 text-ink-2 transition-colors hover:border-leaf-300 hover:bg-leaf-50 hover:text-leaf-800";

  return (
    <>
      <span className="flex shrink-0 items-center gap-1.5">
        {email && (
          <button type="button" className={button} onClick={() => start("email")} aria-label={fmt(m.emailAria, { name: target.personName })} title={m.emailTitle}>
            <Mail className="size-4" aria-hidden="true" />
          </button>
        )}
        {chat && (
          <button type="button" className={button} onClick={() => start("chat")} aria-label={fmt(m.chatAria, { name: target.personName })} title={m.chatTitle}>
            <MessageCircle className="size-4" aria-hidden="true" />
          </button>
        )}
      </span>
      {open && <ConversationDialog target={target} kind={open} returnTo={returnTo(open)} onClose={() => setOpen(null)} />}
    </>
  );
}
