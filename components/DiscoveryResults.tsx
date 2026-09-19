import Link from "next/link";
import {
  ArrowLeft,
  CircleDashed,
  Compass,
  Gift,
  Hash,
  MapPin,
  Sparkles,
  Tag,
  Type,
  type LucideIcon,
} from "lucide-react";
import { DomainTag } from "@/components/DomainTag";
import { DemoTag } from "@/components/ProjectCard";
import { StageBadge } from "@/components/StageBadge";
import { buttonVariants } from "@/components/ui/button";
import type { DiscoveryReasonKind, DiscoveryResult } from "@/lib/discovery";
import { t } from "@/lib/locale";
import { cn } from "@/lib/utils";

const REASON_STYLE: Record<DiscoveryReasonKind, { icon: LucideIcon; tone: string; label: string }> = {
  need: { icon: CircleDashed, tone: "bg-need-100 text-need-700", label: "Need" },
  offer: { icon: Gift, tone: "bg-offer-100 text-offer-700", label: "Offer" },
  words: { icon: Type, tone: "bg-paper-3 text-ink-2", label: "מילים" },
  topic: { icon: Tag, tone: "bg-leaf-100 text-leaf-800", label: "נושא" },
  domain: { icon: Hash, tone: "bg-leaf-100 text-leaf-800", label: "תחום" },
  scope: { icon: MapPin, tone: "bg-paper-3 text-ink-2", label: "היקף" },
};

const INTENT_LABEL = {
  seeking: "מחפשים",
  offering: "רוצים לתרום",
  creating: "רוצים ליצור",
  exploring: "סקרנים",
} as const;

/**
 * "What we understood → what we found → why → what you could do."
 * Used by both /discover (a sentence) and /wishes (a fuller wish).
 */
export function DiscoveryResults({ result, className }: { result: DiscoveryResult; className?: string }) {
  const { interpretation: i, matches, reasons, suggested_actions } = result;

  return (
    <div className={cn("space-y-12", className)}>
      {/* what we understood */}
      <section aria-labelledby="interpretation" className="rounded-[2rem] border border-leaf-200 bg-leaf-50/70 p-6 sm:p-8">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-leaf-700">
          <Compass className="size-4" aria-hidden="true" />
          <span id="interpretation">הבנו ש…</span>
          <span className="rounded-full bg-leaf-100 px-2 py-0.5 text-xs font-medium">{INTENT_LABEL[i.intent]}</span>
        </p>
        <p className="font-display text-2xl font-medium leading-snug text-leaf-900 sm:text-[1.75rem]">{i.summary}</p>

        {i.topics.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="נושאים שזיהינו">
            {i.topics.map((topic) => (
              <li
                key={topic.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-leaf-200 bg-white px-3.5 py-1.5 text-sm font-medium text-leaf-800"
              >
                <Sparkles className="size-3.5 text-leaf-500" aria-hidden="true" />
                {topic.label}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-5 text-xs leading-relaxed text-ink-3">
          זו קריאה פשוטה של המילים שכתבתם — לא בינה מלאכותית. אם פספסנו, נסחו שוב במילים אחרות.
        </p>
      </section>

      {/* what we found */}
      <section aria-labelledby="found">
        {matches.length > 0 ? (
          <>
            <h2 id="found" className="mb-2 font-display text-3xl font-bold text-leaf-900">
              מצאנו {matches.length === 1 ? "מיזם אחד" : `${matches.length} מיזמים`} שעשויים להיות רלוונטיים
            </h2>
            <p className="mb-8 text-ink-2">לכל אחד מהם יש הסבר — למה הוא הופיע כאן.</p>

            <ol className="space-y-6">
              {matches.map(({ project }, idx) => (
                <li key={project.id}>
                  <article className="grid gap-6 rounded-[2rem] border border-line bg-white/80 p-6 shadow-soft transition-shadow hover:shadow-lift sm:p-8 md:grid-cols-[1.1fr_1fr]">
                    <div className="flex flex-col">
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <span className="grid size-7 place-items-center rounded-full bg-leaf-100 font-display text-sm font-bold text-leaf-800">
                          {idx + 1}
                        </span>
                        <StageBadge stage={project.status.lifecycle_stage} />
                        {project.portal.is_demo && <DemoTag />}
                      </div>
                      <h3 className="font-display text-3xl font-bold leading-tight text-leaf-900">
                        <Link href={`/projects/${project.slug}`} className="underline-offset-4 hover:underline">
                          {t(project.name)}
                        </Link>
                      </h3>
                      <p className="mt-2 leading-snug text-ink-2">{t(project.tagline)}</p>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {project.domains.map((d) => (
                          <DomainTag key={d} domain={d} />
                        ))}
                      </div>
                      <Link
                        href={`/projects/${project.slug}`}
                        className={cn(buttonVariants({ variant: "soft", size: "sm" }), "mt-6 w-fit")}
                      >
                        להכיר את המיזם <ArrowLeft />
                      </Link>
                    </div>

                    <div className="rounded-2xl bg-paper-2/70 p-5">
                      <h4 className="mb-3 font-sans text-sm font-semibold text-ink">למה הוא הופיע כאן?</h4>
                      <ul className="space-y-3">
                        {(reasons[project.id] ?? []).map((r) => {
                          const style = REASON_STYLE[r.kind];
                          return (
                            <li key={r.kind + r.text} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink">
                              <span
                                className={cn(
                                  "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
                                  style.tone,
                                )}
                              >
                                <style.icon className="size-3" aria-hidden="true" />
                                {style.label}
                              </span>
                              <span>{r.text}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-line-2 bg-white/50 px-6 py-14 text-center">
            <h2 id="found" className="font-display text-2xl font-bold text-leaf-900">
              לא מצאנו כרגע מיזם שמתאים בבירור
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-ink-2">
              זה לא אומר שהמשאלה לא חשובה — אולי היא בדיוק ההזדמנות. אפשר לנסח אחרת, לחפש לפי תחום, או להתחיל משהו בעצמכם.
            </p>
          </div>
        )}
      </section>

      {/* what you could do */}
      {suggested_actions.length > 0 && (
        <section aria-labelledby="actions">
          <h2 id="actions" className="mb-2 font-display text-2xl font-bold text-leaf-900">
            ומה אפשר לעשות עכשיו?
          </h2>
          <p className="mb-6 text-sm text-ink-3">הצעות בלבד. אתם מחליטים.</p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {suggested_actions.map((a) => (
              <li key={a.href + a.label}>
                <Link
                  href={a.href}
                  className="group flex h-full items-start justify-between gap-4 rounded-2xl border border-line bg-white/70 p-5 transition-all hover:-translate-y-0.5 hover:border-leaf-300 hover:bg-white hover:shadow-soft"
                >
                  <span>
                    <span className="block font-semibold text-leaf-900">{a.label}</span>
                    {a.hint && <span className="mt-1 block text-sm text-ink-2">{a.hint}</span>}
                  </span>
                  <ArrowLeft className="mt-1 size-4 shrink-0 text-ink-3 transition-transform group-hover:-translate-x-1 group-hover:text-leaf-700" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
