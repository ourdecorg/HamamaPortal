import { Link } from "@/components/LocaleLink";
import { Wordmark } from "@/components/Logo";
import { getMessages } from "@/lib/i18n/server";

export async function SiteFooter() {
  const m = (await getMessages()).footer;
  return (
    <footer className="mt-28 border-t border-line bg-paper-2/60">
      <div className="page-wrap grid gap-12 py-14 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="space-y-4">
          <Wordmark showSubtitle={false} />
          <p className="max-w-sm text-[0.95rem] text-ink-2">{m.blurb}</p>
          <p className="text-xs text-ink-3" dir="ltr">
            {m.tagline}
          </p>
        </div>

        <div>
          <h2 className="mb-4 font-sans text-sm font-semibold text-ink">{m.startHere}</h2>
          <ul className="space-y-2.5 text-[0.95rem] text-ink-2">
            <li><Link className="hover:text-leaf-700" href="/projects">{m.linkProjects}</Link></li>
            <li><Link className="hover:text-leaf-700" href="/connections">{m.linkConnections}</Link></li>
            <li><Link className="hover:text-leaf-700" href="/wishes">{m.linkWish}</Link></li>
            <li><Link className="hover:text-leaf-700" href="/projects/new">{m.linkAdd}</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="mb-4 font-sans text-sm font-semibold text-ink">{m.howWeWork}</h2>
          <ul className="space-y-3 text-sm text-ink-2">
            {m.principles.map((p) => (
              <li key={p.title}>
                <span className="font-medium text-ink">{p.title}. </span>
                {p.body}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-line/80">
        <p className="page-wrap py-5 text-xs leading-relaxed text-ink-3">{m.demoNotice}</p>
      </div>
    </footer>
  );
}
