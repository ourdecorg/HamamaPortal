import { timingSafeEqual } from "node:crypto";
import { getMailConfig } from "@/lib/mail/config";
import { flushOutbox } from "@/lib/mail/outbox";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Send what is waiting in the outgoing mail queue. Emails normally go out right after the action that queued
 * them; this is for a scheduler (e.g. a Railway cron service, every few minutes) to retry what failed:
 *
 *   curl -X POST -H "Authorization: Bearer $MAIL_WORKER_SECRET" https://<site>/api/mail/flush
 */
export async function POST(request: Request) {
  const config = getMailConfig();
  if (!config) return Response.json({ error: "Not configured" }, { status: 404 });

  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(config.workerSecret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await flushOutbox(await getSiteUrl(), 50);
  return Response.json(result);
}
