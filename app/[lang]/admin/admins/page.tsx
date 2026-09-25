import type { Metadata } from "next";
import { AdminsManager } from "@/components/admin/AdminsManager";
import { listAdminGrants, requireAdminPage } from "@/lib/admin";
import { LOCALE_META } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.nav.admins };
}

export default async function AdminAdminsPage() {
  const me = await requireAdminPage("/admin/admins");
  const [locale, messages, grants] = await Promise.all([getLocale(), getMessages(), listAdminGrants()]);
  const m = messages.admin.admins;
  const date = (iso: string) => new Date(iso).toLocaleDateString(LOCALE_META[locale].dateLocale, { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <header className="mb-10 max-w-2xl">
        <h1 className="font-display text-4xl font-semibold leading-tight text-leaf-900 sm:text-5xl">{m.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">{m.body}</p>
      </header>
      <AdminsManager
        me={me.id}
        grants={grants.map((g) => ({
          ...g,
          grantedOn: date(g.grantedAt),
          revokedOn: g.revokedAt ? date(g.revokedAt) : null,
        }))}
      />
    </>
  );
}
