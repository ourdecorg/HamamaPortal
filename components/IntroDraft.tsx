"use client";

import { useMemo, useState } from "react";
import { Check, Copy, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withPrefix } from "@/lib/locale";
import type { Connection } from "@/lib/matching";

function joinNames(names: string[], fallback: string): string {
  const firstNames = names.map((n) => n.split(" ")[0]);
  if (firstNames.length === 0) return fallback;
  if (firstNames.length === 1) return firstNames[0];
  return `${firstNames.slice(0, -1).join(", ")} ו${firstNames[firstNames.length - 1]}`;
}

/** A warm double-introduction the reader can edit and send themselves. */
export function draftIntroduction(c: Connection): string {
  const a = c.project_a;
  const b = c.project_b;
  const why = c.reasons[0]?.text ?? c.summary;
  return [
    `היי ${joinNames(a.stewards, `צוות ${a.name}`)} ו${joinNames(b.stewards, `צוות ${b.name}`)},`,
    "",
    `בפורטל חממה עלה חיבור אפשרי בין ${a.name} ${withPrefix("ל", b.name)}:`,
    `• ${a.name} מחפש: ${c.need.label}`,
    `• ${b.name} מציע: ${c.offer.label}`,
    "",
    `למה זה נראה מעניין: ${why}`,
    `מה עוד לא ברור לנו: ${c.unknowns.slice(0, 3).join("; ")}.`,
    "",
    "אשמח לקבוע שיחת היכרות קצרה של חצי שעה, רק כדי לבדוק אם יש כאן משהו. ואם זה לא מתאים — לגמרי בסדר.",
  ].join("\n");
}

export function IntroDraft({ connection, defaultOpen = false }: { connection: Connection; defaultOpen?: boolean }) {
  const initial = useMemo(() => draftIntroduction(connection), [connection]);
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
        <PenLine /> ניסוח הודעת היכרות
      </Button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-link-200 bg-white/80 p-4">
      <p className="mb-2 text-sm text-ink-2">
        טיוטה שאפשר לערוך ולשלוח בעצמכם. חממה לא שולחת דבר בשמכם — <strong className="font-semibold text-ink">אתם מחליטים.</strong>
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        aria-label="טיוטת הודעת היכרות"
        className="w-full resize-y rounded-xl border border-line-2 bg-paper p-3 text-sm leading-relaxed text-ink focus:border-link-500 focus:outline-none focus:ring-4 focus:ring-link-100"
      />
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? "הועתק" : "העתקת הטקסט"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          סגירה
        </Button>
      </div>
    </div>
  );
}
