"use client";

import { usePathname } from "next/navigation";
import { LayoutGrid, ShieldCheck, Sprout } from "lucide-react";
import { Link } from "@/components/LocaleLink";
import { useMessages } from "@/components/LocaleProvider";
import { splitLocale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", key: "overview", Icon: LayoutGrid },
  { href: "/admin/projects", key: "projects", Icon: Sprout },
  { href: "/admin/admins", key: "admins", Icon: ShieldCheck },
] as const;

/** The admin area's own navigation (the site header stays as it is). */
export function AdminNav() {
  const m = useMessages().admin;
  const path = splitLocale(usePathname()).path;
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));

  return (
    <nav aria-label={m.navAria} className="mb-10 flex flex-wrap gap-2 border-b border-line-2 pb-4">
      {ITEMS.map(({ href, key, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active(href) ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[0.95rem] font-medium text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink",
            active(href) && "bg-leaf-50 text-leaf-800 hover:bg-leaf-50",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {m.nav[key]}
        </Link>
      ))}
    </nav>
  );
}
