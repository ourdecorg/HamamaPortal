import type { Metadata } from "next";
import { BellOff, Check } from "lucide-react";
import { confirmStop } from "@/app/[lang]/contact/actions";
import { Link } from "@/components/LocaleLink";
import { Button, buttonVariants } from "@/components/ui/button";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).meta.contactStop.title, robots: { index: false } };
}

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The "stop" link at the bottom of every portal email. Opening it changes nothing — mail systems open links on
 * their own to scan them — the person confirms with a button. No account needed: the token is the proof.
 */
export default async function ContactStopPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const m = (await getMessages()).contactStop;
  const token = typeof sp.t === "string" && TOKEN.test(sp.t) ? sp.t : null;
  const done = sp.done === "conversation" || sp.done === "contact" ? sp.done : sp.done ? "invalid" : null;

  return (
    <div className="page-wrap pb-10 pt-16">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-line bg-white/80 p-8 text-center shadow-soft">
        {done === "conversation" || done === "contact" ? (
          <>
            <Check className="mx-auto mb-4 size-6 text-leaf-600" aria-hidden="true" />
            <p role="status" className="leading-relaxed text-ink">
              {done === "conversation" ? m.doneConversation : m.doneContact}
            </p>
          </>
        ) : done === "invalid" || !token ? (
          <p className="leading-relaxed text-ink-2">{m.invalid}</p>
        ) : (
          <>
            <BellOff className="mx-auto mb-4 size-6 text-ink-3" aria-hidden="true" />
            <h1 className="font-display text-3xl font-semibold text-leaf-900">{m.title}</h1>
            <p className="mt-3 leading-relaxed text-ink-2">{m.body}</p>
            <form action={confirmStop} className="mt-6">
              <input type="hidden" name="t" value={token} />
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit">{m.confirm}</Button>
            </form>
          </>
        )}
        <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-6")}>
          {m.home}
        </Link>
      </div>
    </div>
  );
}
