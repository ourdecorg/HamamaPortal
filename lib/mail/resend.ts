import type { MailConfig } from "@/lib/mail/config";

/**
 * The two Resend calls the portal makes, over plain fetch (no SDK). Server-only.
 * https://resend.com/docs/api-reference/emails/send-email
 * https://resend.com/docs/api-reference/emails/retrieve-received-email
 */

const API = "https://api.resend.com";

export interface OutgoingEmail {
  /** Display name; the address is always MAIL_FROM. */
  fromName: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
  /** Sending the same key twice sends once (Resend keeps it for 24 hours): retries never duplicate an email. */
  idempotencyKey: string;
}

/** `"Name" <address>`, with characters that would break the header removed from the name. */
export function formatFrom(name: string, address: string): string {
  const clean = name.replace(/["\\<>\r\n]/g, "").trim().slice(0, 100);
  return clean ? `"${clean}" <${address}>` : address;
}

export async function sendEmail(config: MailConfig, email: OutgoingEmail, fetcher: typeof fetch = fetch): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await fetcher(`${API}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from: formatFrom(email.fromName, config.from),
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        ...(email.headers ? { headers: email.headers } : {}),
      }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) return { ok: false, error: `resend ${res.status}: ${body.message ?? "no id"}` };
    return { ok: true, id: body.id };
  } catch (err) {
    return { ok: false, error: `resend: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  message_id: string | null;
}

/** The full content of an incoming email (the webhook only carries its metadata). Null when it can't be read. */
export async function getReceivedEmail(config: MailConfig, id: string, fetcher: typeof fetch = fetch): Promise<ReceivedEmail | null> {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) return null;
  try {
    const res = await fetcher(`${API}/emails/receiving/${id}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ReceivedEmail;
  } catch {
    return null;
  }
}
