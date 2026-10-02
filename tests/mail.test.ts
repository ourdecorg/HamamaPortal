/**
 * The email side, without sending anything: webhook signatures, reading replies, and the emails themselves.
 *
 *   npm run test:mail
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { guessLocale, htmlToText, replyText, replyTokenFrom, stripReply, verifyWebhook } from "@/lib/mail/inbound";
import { formatFrom, sendEmail } from "@/lib/mail/resend";
import { renderJob, type MailJob } from "@/lib/mail/templates";

const SECRET = `whsec_${Buffer.from("a-webhook-secret-for-tests").toString("base64")}`;
const TOKEN = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

function sign(body: string, id = "msg_1", timestamp = Math.floor(Date.now() / 1000)) {
  const key = Buffer.from(SECRET.slice(6), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { id, timestamp: String(timestamp), signature: `v1,${signature}` };
}

describe("webhook signatures", () => {
  const body = JSON.stringify({ type: "email.received", data: { email_id: "e1" } });

  it("accepts a request signed with the secret", () => {
    assert.equal(verifyWebhook(SECRET, sign(body), body), true);
    // Several signatures (during a secret rotation): any valid one is enough.
    const signed = sign(body);
    assert.equal(verifyWebhook(SECRET, { ...signed, signature: `v1,bm9wZQ== ${signed.signature}` }, body), true);
  });

  it("refuses a changed body, a wrong secret, missing headers and old requests", () => {
    assert.equal(verifyWebhook(SECRET, sign(body), body.replace("e1", "e2")), false);
    assert.equal(verifyWebhook(`whsec_${Buffer.from("other").toString("base64")}`, sign(body), body), false);
    assert.equal(verifyWebhook(SECRET, { ...sign(body), signature: null }, body), false);
    assert.equal(verifyWebhook(SECRET, sign(body, "msg_1", Math.floor(Date.now() / 1000) - 3600), body), false);
  });
});

describe("reading a reply", () => {
  it("finds the token of our reply address, and only on our domain", () => {
    assert.equal(replyTokenFrom(["someone@x.org", `Reply+${TOKEN.toUpperCase()}@Reply.Example.org`], "reply.example.org"), TOKEN);
    assert.equal(replyTokenFrom([`reply+${TOKEN}@evil.example`], "reply.example.org"), null);
    assert.equal(replyTokenFrom([null, undefined, "plain@reply.example.org"], "reply.example.org"), null);
  });

  it("keeps only the new text of a Gmail (English) reply", () => {
    const raw = `Sounds great, let's talk on Sunday.\n\nDana\n\nOn Tue, Sep 29, 2026 at 10:02 AM Carol via Hamama <hamama@mail.example.org> wrote:\n> ——— Write your reply above this line ———\n>\n> Hello!`;
    assert.equal(stripReply(raw), "Sounds great, let's talk on Sunday.\n\nDana");
  });

  it("keeps only the new text of a Gmail (Hebrew) reply", () => {
    const raw = "נשמע מצוין, נדבר ביום ראשון.\n\n‫בתאריך יום ג׳, 29 בספט׳ 2026 ב-10:02 מאת ‪Carol via Hamama‬‏ <‪hamama@mail.example.org‬‏>:‬\n> שלום";
    assert.equal(stripReply(raw), "נשמע מצוין, נדבר ביום ראשון.");
  });

  it("cuts at our own marker, Outlook's header block, and a signature", () => {
    assert.equal(stripReply("Yes!\n——— Write your reply above this line ———\nold text"), "Yes!");
    assert.equal(stripReply("כן!\n\nFrom: Hamama <hamama@mail.example.org>\nSent: Tuesday\nSubject: x\n\nold"), "כן!");
    assert.equal(stripReply("Sure.\n-- \nDana Levi\nCEO"), "Sure.");
  });

  it("reads HTML-only replies, without the quoted part", () => {
    const html = `<div dir="rtl">תודה רבה&nbsp;&amp; להתראות<br>דנה</div><div class="gmail_quote">On … wrote:<blockquote>old</blockquote></div>`;
    assert.equal(replyText({ text: null, html }), "תודה רבה & להתראות\nדנה");
    assert.equal(htmlToText(`data:text/html;base64,${Buffer.from("<p>hi</p>").toString("base64")}`).trim(), "hi");
  });

  it("guesses the language of a reply", () => {
    assert.equal(guessLocale("שלום"), "he");
    assert.equal(guessLocale("hello"), "en");
  });
});

describe("the emails", () => {
  const job = (over: Partial<MailJob> = {}): MailJob => ({
    id: "job-1",
    kind: "message",
    locale: "he",
    to_email: "erin@elsewhere.org",
    to_name: "Erin",
    to_registered: false,
    token: TOKEN,
    project: { slug: "team-project", name: { translations: { he: "צוות", en: "Team" } } },
    conversation: { id: "c-1", kind: "email", subject: "שאלה על המיזם", first: true },
    message: { body: "רציתי לשאול <משהו>", from_name: "Carol" },
    ...over,
  });

  it("a message: from the writer via Hamama, replies to the private reply address, never an address in the body", () => {
    const email = renderJob(job(), "https://hamama.example.org/", "reply.example.org")!;
    assert.equal(email.fromName, "Carol דרך החממה");
    assert.equal(email.subject, "שאלה על המיזם");
    assert.equal(email.replyTo, `reply+${TOKEN}@reply.example.org`);
    assert.ok(email.text.startsWith("——— כתבו את התשובה מעל השורה הזו ———"));
    assert.ok(email.text.includes("רציתי לשאול <משהו>"));
    assert.ok(email.text.includes(`https://hamama.example.org/he/contact/stop?t=${TOKEN}`));
    assert.ok(email.text.includes("https://hamama.example.org/he/my-space?conversation=c-1"));
    assert.ok(!email.text.includes("erin@elsewhere.org") && !email.html.includes("erin@elsewhere.org"));
    assert.ok(email.html.includes('dir="rtl"'));
    assert.ok(email.html.includes("&lt;משהו&gt;"), "the body is escaped in HTML");
    assert.equal(email.headers?.References, "<conversation-c-1@reply.example.org>");
  });

  it("later messages are replies (Re:), in the conversation's language of the writer", () => {
    const email = renderJob(job({ locale: "en", conversation: { id: "c-1", kind: "email", subject: "A question", first: false } }), "https://h.example", "r.example")!;
    assert.equal(email.subject, "Re: A question");
    assert.equal(email.fromName, "Carol via Hamama");
    assert.ok(email.html.includes('dir="ltr"'));
  });

  it("a chat note quotes the message and links to the conversation", () => {
    const email = renderJob(job({ kind: "notify", to_registered: true, conversation: { id: "c-2", kind: "chat", subject: null, first: true } }), "https://h.example", "r.example")!;
    assert.equal(email.subject, "הודעה חדשה מCarol בחממה");
    assert.ok(email.text.includes("> רציתי לשאול <משהו>"));
    assert.ok(email.text.includes("https://h.example/he/my-space?conversation=c-2"));
  });

  it("the notice to someone added to a team: the initiative, and how to stop being contacted", () => {
    const email = renderJob(
      job({ kind: "notice", locale: "en", conversation: null, message: null, to_name: "Bob" }),
      "https://h.example",
      "r.example",
    )!;
    assert.equal(email.subject, "You were added to “Team” on Hamama");
    assert.equal(email.replyTo, undefined);
    assert.ok(email.text.startsWith("Hello Bob,"));
    assert.ok(email.text.includes("https://h.example/en/projects/team-project"));
    assert.ok(email.text.includes(`https://h.example/en/contact/stop?t=${TOKEN}`));
  });

  it("nothing to write without what the email is about", () => {
    assert.equal(renderJob(job({ message: null }), "https://h.example", "r.example"), null);
    assert.equal(renderJob(job({ kind: "notice", project: null }), "https://h.example", "r.example"), null);
  });

  it("the From header cannot be broken by a name", () => {
    assert.equal(formatFrom('Ev"il <x@y.z>\r\nBcc: a@b.c', "hamama@mail.example.org"), '"Evil x@y.zBcc: a@b.c" <hamama@mail.example.org>');
  });

  it("sends through Resend with the outbox id as the idempotency key", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const config = { apiKey: "re_test", from: "hamama@mail.example.org", replyDomain: "r.example", workerSecret: "x".repeat(32), webhookSecret: null };
    const res = await sendEmail(config, { fromName: "Carol via Hamama", to: "a@b.c", subject: "s", text: "t", html: "h", idempotencyKey: "hamama-job-1" }, fake);
    assert.deepEqual(res, { ok: true, id: "re_1" });
    assert.equal(seen!.url, "https://api.resend.com/emails");
    assert.equal((seen!.init.headers as Record<string, string>)["Idempotency-Key"], "hamama-job-1");
    assert.equal(JSON.parse(String(seen!.init.body)).from, '"Carol via Hamama" <hamama@mail.example.org>');
  });
});
