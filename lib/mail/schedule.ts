import { after } from "next/server";
import { isMailConfigured } from "@/lib/mail/config";
import { flushOutbox } from "@/lib/mail/outbox";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Send the queued emails once the current response is done, so nobody waits for the mail provider.
 * For server actions and route handlers that may have queued mail.
 */
export async function sendMailSoon(): Promise<void> {
  if (!isMailConfigured()) return;
  const site = await getSiteUrl();
  after(async () => {
    await flushOutbox(site);
  });
}
