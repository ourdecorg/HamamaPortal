import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Incoming replies: pure helpers for /api/mail/inbound (tested in tests/mail.test.ts). Server-only.
 */

// ------------------------------------------------------------ signature ---

/**
 * Verify a webhook from Resend. Resend signs with Svix: HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<body>",
 * keyed with the base64 part of the `whsec_…` secret; `svix-signature` holds one or more "v1,<base64>" entries.
 * Requests older (or newer) than five minutes are refused, so a captured request cannot be replayed later.
 */
export function verifyWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowMs = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > 5 * 60) return false;

  let key: Buffer;
  try {
    key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  } catch {
    return false;
  }
  if (!key.length) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// ---------------------------------------------------------------- token ---

const TOKEN = /reply\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@([a-z0-9.-]+)/i;

/** The reply token of the first reply+<token>@<replyDomain> address among the recipients, or null. */
export function replyTokenFrom(addresses: (string | null | undefined)[], replyDomain: string): string | null {
  for (const address of addresses) {
    const match = TOKEN.exec(address ?? "");
    if (match && match[2].toLowerCase() === replyDomain.toLowerCase()) return match[1].toLowerCase();
  }
  return null;
}

// ----------------------------------------------------------------- body ---

/** Some providers hand the HTML over as a data: URI. */
function decodeDataUri(value: string): string {
  const match = /^data:[^,]*?(;base64)?,([\s\S]*)$/.exec(value);
  if (!match) return value;
  try {
    return match[1] ? Buffer.from(match[2], "base64").toString("utf8") : decodeURIComponent(match[2]);
  } catch {
    return "";
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Readable text from an HTML email: quoted parts dropped, line breaks kept, tags and entities resolved. */
export function htmlToText(rawHtml: string): string {
  const html = decodeDataUri(rawHtml);
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<div[^>]*class="?gmail_quote[\s\S]*$/i, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (whole, code: string) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .replace(/ /g, " ");
}

/** Where the quoted original starts, in the ways common mail programs write it. */
const QUOTE_STARTS: RegExp[] = [
  /^[>\s]*[-—]{3,}\s*(כתבו את התשובה מעל|Write your reply above)/im, // our own marker (in both languages)
  /^\s*On .{1,300}wrote:\s*$/im, // Gmail, Apple Mail (English)
  /^\s*[‎‏‪-‮]*בתאריך .{1,300}(מאת|כתב|כתבה).{0,300}:\s*[‎‏‪-‮]*$/im, // Gmail (Hebrew)
  /^\s*-{2,}\s*Original Message\s*-{2,}/im,
  /^\s*_{8,}\s*$/m, // Outlook's separator line
  /^\s*(From|מאת):\s.+\n\s*(Sent|Date|נשלח|תאריך):\s/im, // Outlook header block
];

/** The new part of a reply: without the quoted original, quote marks, or the "-- " signature. */
export function stripReply(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n");
  for (const pattern of QUOTE_STARTS) {
    const match = pattern.exec(text);
    if (match) text = text.slice(0, match.index);
  }
  const lines = text.split("\n");
  const signature = lines.findIndex((line) => line === "-- " || line === "--");
  const kept = (signature >= 0 ? lines.slice(0, signature) : lines).filter((line) => !/^\s*>/.test(line));
  return kept
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The reply's new text, from the plain-text part if there is one, else from the HTML. */
export function replyText(email: { text?: string | null; html?: string | null }): string {
  const source = email.text?.trim() ? email.text : email.html ? htmlToText(email.html) : "";
  return stripReply(source ?? "").slice(0, 10000);
}

/** The language a reply was probably written in (for the emails it triggers). */
export function guessLocale(text: string): "he" | "en" {
  return /[֐-׿]/.test(text) ? "he" : "en";
}
