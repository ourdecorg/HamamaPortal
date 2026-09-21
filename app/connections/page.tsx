import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Layers, Repeat2, Share2, Tags, X } from "lucide-react";
import { ConnectionCard } from "@/components/ConnectionCard";
import { NeedBadge } from "@/components/NeedBadge";
import { buttonVariants } from "@/components/ui/button";
import { connectionsFor } from "@/lib/matching";
import { t } from "@/lib/locale";
import { getConnections, getProjectBySlug, getUnmetNeeds } from "@/lib/projects";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "חיבורים",
  description: "המקומות שבהם צורך של מיזם אחד פוגש הצעה של מיזם אחר — עם הסבר, ועם מה שעדיין לא ידוע.",
};

const SIGNALS = [
  { icon: Layers, title: "צורך מול הצעה", body: "מחפשים סוג משאב שמישהו אחר מציע: קהילה, ידע, כלי, מרחב." },
  { icon: Tags, title: "מילים משותפות", body: "הנושאים שבהם הצורך וההצעה עוסקים — לא רק הקטגוריה שלהם." },
  { icon: Share2, title: "תחום והעדפות", body: "תחומים משותפים, ורצון דומה לנסות, לחקור או ללמד." },
  { icon: Repeat2, title: "הדדיות", body: "כשגם לצד השני יש צורך שאפשר לענות עליו — זה נרשם." },
];

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const projectSlug = typeof sp.project === "string" ? sp.project : undefined;

  const [all, unmet, focusProject] = await Promise.all([
    getConnections(),
    getUnmetNeeds(),
    projectSlug ? getProjectBySlug(projectSlug) : Promise.resolve(null),
  ]);
  const connections = focusProject ? connectionsFor(all, focusProject.id) : all;

  return (
    <div className="pb-8">
      {/* intro ───────────────────────────────────────────────── */}
      <header className="page-wrap pb-14 pt-12 sm:pt-16">
        <p className="mb-3 text-sm font-semibold tracking-wide text-link-700">Connections · חיבורים</p>
        <h1 className="max-w-4xl font-display text-4xl font-semibold leading-[1.1] text-leaf-900 sm:text-6xl">
          לא רק מיזמים.
          <br />
          <span className="text-link-500">האפשרויות שבין המיזמים.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2 sm:text-xl">
          חממה קוראת מה כל מיזם צריך ומה הוא מציע, ומחפשת איפה שני אלה נפגשים. כל חיבור כאן מגיע עם הסבר — למה הוא עשוי לעבוד, ומה עדיין צריך לברר.
        </p>

        <ul className="mt-12 grid gap-x-8 gap-y-6 border-t border-line-2 pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {SIGNALS.map((s) => (
            <li key={s.title} className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-link-50 text-link-700">
                <s.icon className="size-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{s.title}</span>
                <span className="text-sm leading-snug text-ink-2">{s.body}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-8 max-w-3xl rounded-2xl bg-paper-2/80 px-5 py-4 text-sm leading-relaxed text-ink-2">
          <strong className="font-semibold text-ink">שימו לב:</strong> אלה השערות, לא הבטחות. הזיהוי נעשה בכללים פשוטים ושקופים, בלי בינה מלאכותית. אנחנו מציעים — אתם מחליטים אם יש כאן משהו.
        </p>
      </header>

      {/* list ────────────────────────────────────────────────── */}
      <section className="page-wrap" aria-label="רשימת החיבורים">
        {focusProject && (
          <div className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-link-200 bg-link-50/60 px-5 py-3 text-sm text-ink-2">
            מציגים רק חיבורים של <strong className="text-ink">{t(focusProject.name)}</strong>
            <Link href="/connections" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ms-auto")}>
              <X /> כל החיבורים
            </Link>
          </div>
        )}

        {connections.length > 0 ? (
          <>
            <p className="mb-6 text-sm font-medium text-ink-2">
              {connections.length} חיבורים אפשריים, מהאות החזק ביותר ואילך
            </p>
            <div className="space-y-9">
              {connections.map((c) => (
                <ConnectionCard key={c.id} connection={c} variant="full" perspectiveId={focusProject?.id} />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-line-2 bg-white/50 px-6 py-16 text-center">
            <h2 className="font-display text-2xl font-semibold text-leaf-900">עדיין לא זיהינו חיבורים</h2>
            <p className="mx-auto mt-2 max-w-md text-ink-2">
              כשמיזמים יוסיפו צרכים והצעות, כאן יופיעו המקומות שבהם הם נפגשים.
            </p>
            <Link href="/projects/new" className={cn(buttonVariants({ variant: "soft" }), "mt-6")}>
              הוסיפו מיזם <ArrowLeft />
            </Link>
          </div>
        )}
      </section>

      {/* unmet needs ─────────────────────────────────────────── */}
      {unmet.length > 0 && !focusProject && (
        <section className="page-wrap mt-24" aria-labelledby="unmet-title">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold tracking-wide text-need-700">Opportunities · הזדמנויות</p>
            <h2 id="unmet-title" className="font-display text-3xl font-semibold text-leaf-900 sm:text-4xl">
              צרכים שעדיין מחכים להצעה
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-2">
              לא לכל צורך יש מענה במרחב — עדיין. אלה המקומות שבהם הצעה חדשה תעשה הכי הרבה הבדל. אולי היא אצלכם?
            </p>
          </div>

          <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {unmet.map(({ project, need }) => (
              <li key={`${project.id}-${need.id}`}>
                <Link href={`/projects/${project.slug}`} className="group block">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-leaf-900 group-hover:text-leaf-600">
                    {project.name}
                    <ArrowLeft className="size-3.5 opacity-0 transition-all group-hover:-translate-x-1 group-hover:opacity-100" />
                  </p>
                  <NeedBadge need={{
                      type: need.type,
                      title: { translations: { he: need.label } },
                      description: { translations: { he: need.description } },
                    }} />
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-10">
            <Link href="/projects/new" className={buttonVariants({ variant: "secondary" })}>
              יש לי משהו להציע — הוספת מיזם <ArrowLeft />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
