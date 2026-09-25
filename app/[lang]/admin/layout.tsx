import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdminPage } from "@/lib/admin";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const title = (await getMessages()).meta.admin.title;
  return { title: { default: title, template: `%s · ${title}` }, robots: { index: false, follow: false } };
}

/**
 * The admin area. This check keeps the admin navigation away from anyone who is not an admin; every page and
 * every server action checks again on its own (layouts are not re-rendered on client navigation), and the
 * database checks a third time.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage("/admin");
  return (
    <div className="page-wrap pb-16 pt-10 sm:pt-14">
      <AdminNav />
      {children}
    </div>
  );
}
