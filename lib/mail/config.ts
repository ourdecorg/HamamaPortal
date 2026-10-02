/**
 * Email (Resend) configuration, read from the server environment at runtime. Server-only.
 *
 *   RESEND_API_KEY         sends mail, and reads incoming replies
 *   MAIL_FROM              the sending address, on a domain verified in Resend (e.g. hamama@mail.example.org)
 *   MAIL_REPLY_DOMAIN      the receiving domain in Resend (MX record); replies go to reply+<token>@<this domain>
 *   MAIL_WORKER_SECRET     32+ random characters. Its sha256 is stored in the database (private.app_secrets); it is
 *                          the only key to the outgoing queue — with the addresses — and to recording replies.
 *   RESEND_WEBHOOK_SECRET  (whsec_…) verifies Resend's "email.received" webhook (/api/mail/inbound)
 *
 * Without the first four, the portal still works: people can chat, and nobody can be emailed.
 * Setup: docs/SUPABASE.md, section 8.
 */

export interface MailConfig {
  apiKey: string;
  from: string;
  replyDomain: string;
  workerSecret: string;
  webhookSecret: string | null;
}

const ADDRESS = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/;
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

let warned = false;

export function getMailConfig(): MailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  const replyDomain = process.env.MAIL_REPLY_DOMAIN?.trim().toLowerCase();
  const workerSecret = process.env.MAIL_WORKER_SECRET?.trim();
  if (!apiKey || !from || !replyDomain || !workerSecret) return null;
  if (!ADDRESS.test(from) || !DOMAIN.test(replyDomain) || workerSecret.length < 32) {
    if (!warned) {
      warned = true;
      console.error("[hamama] MAIL_FROM, MAIL_REPLY_DOMAIN or MAIL_WORKER_SECRET is not valid — email is off.");
    }
    return null;
  }
  return { apiKey, from, replyDomain, workerSecret, webhookSecret: process.env.RESEND_WEBHOOK_SECRET?.trim() || null };
}

export function isMailConfigured(): boolean {
  return getMailConfig() !== null;
}
