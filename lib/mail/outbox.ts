import { getMailConfig } from "@/lib/mail/config";
import { sendEmail } from "@/lib/mail/resend";
import { renderJob, type MailJob } from "@/lib/mail/templates";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/server";

/**
 * Send what is waiting in the database's outgoing queue (public.mail_outbox). Server-only.
 *
 * The queue is filled by the database itself (a new message, a person added to a team), so the people who cause
 * an email never see the address it goes to. Only this worker reads the addresses: `mail_claim()` answers only to
 * MAIL_WORKER_SECRET. It runs after the actions that queue mail (Next's `after()`), after an incoming reply, and
 * on POST /api/mail/flush (for a scheduler, to retry what failed).
 *
 * Never throws: a failed email is recorded and retried later (five attempts, then given up).
 */
export async function flushOutbox(site: string, limit = 20): Promise<{ sent: number; failed: number; skipped: number }> {
  const result = { sent: 0, failed: 0, skipped: 0 };
  const config = getMailConfig();
  if (!config || !isSupabaseConfigured()) return result;

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("mail_claim", { p_secret: config.workerSecret, p_limit: limit });
  if (error) {
    console.error("[hamama] mail_claim failed:", error.code, error.message);
    return result;
  }

  for (const job of (data ?? []) as MailJob[]) {
    const done = async (sendError: string | null) => {
      const { error: doneError } = await supabase.rpc("mail_done", { p_secret: config.workerSecret, p_id: job.id, p_error: sendError });
      if (doneError) console.error("[hamama] mail_done failed:", doneError.message);
    };

    const email = job.to_email ? renderJob(job, site, config.replyDomain) : null;
    if (!job.to_email || !email) {
      // Nobody to write to any more (they opted out, or the conversation is gone): nothing to send.
      result.skipped += 1;
      await done(null);
      continue;
    }

    const sent = await sendEmail(config, { ...email, to: job.to_email, idempotencyKey: `hamama-${job.id}` });
    if (sent.ok) {
      result.sent += 1;
      await done(null);
    } else {
      result.failed += 1;
      console.error("[hamama] sending email failed:", sent.error);
      await done(sent.error);
    }
  }
  return result;
}
