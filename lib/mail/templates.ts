import { LOCALE_META, hasLocale, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/format";
import { getMessagesFor } from "@/lib/i18n/messages";
import { t } from "@/lib/locale";
import type { LocalizedText } from "@/types/project";

/**
 * The emails the portal sends, as plain text and simple HTML. Pure (no I/O), so they are tested directly.
 *
 * Addresses never appear in a body: people are named, and replies go to a per-participant reply address.
 * Every email ends with a "stop" link; it opens a page that asks before doing anything (link scanners in mail
 * systems open links on their own).
 */

/** One row of the outgoing queue, as `mail_claim()` returns it (see 20260929120000_contacts.sql). */
export interface MailJob {
  id: string;
  kind: "notice" | "message" | "notify";
  locale: string;
  to_email: string | null;
  to_name: string | null;
  to_registered: boolean | null;
  token: string | null;
  project: { slug: string; name: LocalizedText } | null;
  conversation: { id: string; kind: "email" | "chat"; subject: string | null; first: boolean | null } | null;
  message: { body: string; from_name: string | null } | null;
}

export interface RenderedEmail {
  fromName: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

type Block = { text: string } | { link: string; label: string } | { quote: string } | { rule: true };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function toText(blocks: Block[]): string {
  return blocks
    .map((b) =>
      "text" in b ? b.text : "link" in b ? `${b.label} ${b.link}` : "quote" in b ? b.quote.split("\n").map((l) => `> ${l}`).join("\n") : "—",
    )
    .join("\n\n");
}

function toHtml(blocks: Block[], locale: Locale): string {
  const dir = LOCALE_META[locale].dir;
  const p = (inner: string, style = "") => `<p style="margin:0 0 16px;${style}">${inner}</p>`;
  const body = blocks
    .map((b) => {
      if ("text" in b) return p(escapeHtml(b.text).replace(/\n/g, "<br>"));
      if ("link" in b) return p(`${escapeHtml(b.label)} <a href="${escapeHtml(b.link)}" style="color:#1f5d46">${escapeHtml(b.link)}</a>`, "font-size:13px;color:#5b6660");
      if ("quote" in b)
        return `<blockquote style="margin:0 0 16px;padding:12px 16px;border-inline-start:3px solid #b9d7c8;background:#f3f7f4;border-radius:8px">${escapeHtml(b.quote).replace(/\n/g, "<br>")}</blockquote>`;
      return `<hr style="border:none;border-top:1px solid #e3e6e1;margin:24px 0">`;
    })
    .join("\n");
  return `<!doctype html><html lang="${locale}" dir="${dir}"><body style="margin:0;padding:24px;background:#faf8f3">
<div dir="${dir}" style="max-width:36rem;margin:0 auto;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:#1d2521;text-align:start">
${body}
</div></body></html>`;
}

/** reply+<token>@<domain>: whoever writes to it is that participant, in that conversation. */
export function replyAddress(token: string, domain: string): string {
  return `reply+${token}@${domain}`;
}

/** Null when the job cannot be written (nobody to send to, or it lost what it refers to). */
export function renderJob(job: MailJob, site: string, replyDomain: string): RenderedEmail | null {
  const locale: Locale = hasLocale(job.locale) ? job.locale : "he";
  const m = getMessagesFor(locale).mail;
  const base = `${site.replace(/\/+$/, "")}/${locale}`;
  const projectName = job.project ? t(job.project.name, locale) : "";
  const stopLink = job.token ? `${base}/contact/stop?t=${job.token}` : null;
  const done = (fromName: string, subject: string, blocks: Block[], extra: Partial<RenderedEmail> = {}): RenderedEmail => ({
    fromName,
    subject: subject.replace(/[\r\n]+/g, " ").slice(0, 200),
    text: toText(blocks),
    html: toHtml(blocks, locale),
    ...extra,
  });

  if (job.kind === "notice") {
    if (!job.project || !stopLink) return null;
    return done(m.brand, fmt(m.noticeSubject, { name: projectName }), [
      { text: fmt(m.noticeBody, { person: job.to_name ?? "", name: projectName }) },
      { link: `${base}/projects/${job.project.slug}`, label: m.noticeProject },
      { rule: true },
      { link: stopLink, label: m.noticeStop },
    ]);
  }

  if (!job.conversation || !job.message || !job.token || !stopLink) return null;
  const from = job.message.from_name?.trim() || m.brand;
  const conversationLink = `${base}/my-space?conversation=${job.conversation.id}`;
  const replyTo = replyAddress(job.token, replyDomain);
  // Mail programs thread by these; the id is ours, so every email of a conversation lands in one thread.
  const thread = `<conversation-${job.conversation.id}@${replyDomain}>`;
  const headers = { "In-Reply-To": thread, References: thread };

  if (job.kind === "message") {
    const subject = job.conversation.subject?.trim() || projectName || m.brand;
    return done(
      fmt(m.via, { name: from }),
      job.conversation.first ? subject : fmt(m.messageSubjectReply, { subject }),
      [
        { text: m.replyAbove },
        { text: job.message.body },
        { rule: true },
        { text: fmt(m.messageFooter, { from, about: projectName ? fmt(m.aboutProject, { name: projectName }) : "" }) },
        { text: fmt(m.replyNote, { from }) },
        { link: conversationLink, label: job.to_registered ? m.openConversation : m.registerNote },
        { link: stopLink, label: m.stop },
      ],
      { replyTo, headers },
    );
  }

  // notify: a new chat message
  const snippet = job.message.body.length > 600 ? `${job.message.body.slice(0, 600)}…` : job.message.body;
  return done(
    fmt(m.via, { name: from }),
    fmt(m.notifySubject, { from }),
    [
      { text: m.replyAbove },
      { text: fmt(m.notifyBody, { from }) },
      { quote: snippet },
      { link: conversationLink, label: m.notifyOpen },
      { text: m.notifyReply },
      { rule: true },
      { link: stopLink, label: m.stop },
    ],
    { replyTo, headers },
  );
}
