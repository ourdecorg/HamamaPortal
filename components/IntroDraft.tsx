"use client";

import { useMemo, useState } from "react";
import { Check, Copy, PenLine } from "lucide-react";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/button";
import { fmt, joinList } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/he";
import { withPrefix } from "@/lib/locale";
import type { Connection } from "@/lib/matching";

function joinNames(names: string[], fallback: string, locale: Locale): string {
  const firstNames = names.map((n) => n.split(" ")[0]);
  if (firstNames.length === 0) return fallback;
  return joinList(firstNames, locale);
}

/** A warm double-introduction the reader can edit and send themselves, in the language of the page. */
export function draftIntroduction(c: Connection, m: Messages["intro"], locale: Locale): string {
  const a = c.project_a;
  const b = c.project_b;
  const why = c.reasons[0]?.text ?? c.summary;
  const team = (name: string) => fmt(m.teamOf, { name });
  return [
    fmt(m.greeting, {
      a: joinNames(a.stewards, team(a.name), locale),
      b: joinNames(b.stewards, team(b.name), locale),
    }),
    "",
    fmt(m.lead, { a: a.name, b: b.name, b_lamed: withPrefix("ל", b.name) }),
    fmt(m.aSeeks, { name: a.name, label: c.need.label }),
    fmt(m.bOffers, { name: b.name, label: c.offer.label }),
    "",
    fmt(m.why, { text: why }),
    fmt(m.unclear, { text: c.unknowns.slice(0, 3).join(m.unclearJoin) }),
    "",
    m.closing,
  ].join("\n");
}

export function IntroDraft({ connection, defaultOpen = false }: { connection: Connection; defaultOpen?: boolean }) {
  const locale = useLocale();
  const m = useMessages().intro;
  const initial = useMemo(() => draftIntroduction(connection, m, locale), [connection, m, locale]);
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState(initial);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard can be unavailable (insecure context) — the text stays selectable */
    }
  }

  if (!open) {
    return (
      <Button variant="link" size="sm" onClick={() => setOpen(true)}>
        <PenLine /> {m.open}
      </Button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-link-200 bg-white/80 p-4">
      <p className="mb-2 text-sm text-ink-2">
        {m.note}
        <strong className="font-semibold text-ink">{m.noteStrong}</strong>
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        aria-label={m.aria}
        className="w-full resize-y rounded-xl border border-line-2 bg-paper p-3 text-sm leading-relaxed text-ink focus:border-link-500 focus:outline-none focus:ring-4 focus:ring-link-100"
      />
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? m.copied : m.copy}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {m.close}
        </Button>
      </div>
    </div>
  );
}
