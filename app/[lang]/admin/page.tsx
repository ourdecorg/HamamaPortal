import { NextArrow } from "@/components/Arrows";
import { Link } from "@/components/LocaleLink";
import { buttonVariants } from "@/components/ui/button";
import { listAdminGrants, listAllProjects, requireAdminPage } from "@/lib/admin";
import { getMessages } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export default async function AdminOverviewPage() {
  await requireAdminPage("/admin");
  const m = (await getMessages()).admin;
  const [projects, grants] = await Promise.all([listAllProjects(), listAdminGrants()]);

  const live = projects.filter((p) => !p.deletedAt);
  const shown = live.filter((p) => p.project.portal.review_status === "published" && p.project.portal.visibility !== "private");
  const stats = [
    { label: m.overview.projects, value: live.length },
    { label: m.overview.published, value: shown.length },
    { label: m.overview.hidden, value: live.length - shown.length },
    { label: m.overview.deleted, value: projects.length - live.length },
    { label: m.overview.admins, value: grants.filter((g) => !g.revokedAt).length },
  ];

  return (
    <>
      <header className="mb-10 max-w-2xl">
        <p className="mb-3 text-sm font-semibold tracking-wide text-leaf-600">{m.eyebrow}</p>
        <h1 className="font-display text-4xl font-semibold leading-tight text-leaf-900 sm:text-5xl">{m.overview.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">{m.overview.body}</p>
      </header>

      <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-3xl border border-line bg-white/70 p-5">
            <dt className="text-sm text-ink-3">{s.label}</dt>
            <dd className="mt-1 font-display text-3xl font-semibold text-leaf-900">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/admin/projects" className={cn(buttonVariants({ size: "lg" }))}>
          {m.overview.toProjects} <NextArrow />
        </Link>
        <Link href="/admin/admins" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
          {m.overview.toAdmins} <NextArrow />
        </Link>
      </div>
    </>
  );
}
