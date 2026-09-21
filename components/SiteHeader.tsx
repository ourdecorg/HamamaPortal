"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu, Plus, X } from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/projects", label: "מיזמים" },
  { href: "/discover", label: "גילוי" },
  { href: "/wishes", label: "באר המשאלות" },
  { href: "/connections", label: "חיבורים" },
];

/** `account` is a server-rendered slot (login link / user menu) supplied by the layout. */
export function SiteHeader({ account }: { account?: ReactNode }) {
  const pathname = usePathname();
  // The menu is "open for a path": navigating elsewhere closes it without an effect.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;

  const isActive = (href: string) =>
    pathname === href || (href === "/projects" && pathname.startsWith("/projects") && pathname !== "/projects/new");

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/80 backdrop-blur-xl">
      <div className="page-wrap flex h-[4.25rem] items-center justify-between gap-4">
        <Link href="/" aria-label="החממה — לעמוד הבית" className="shrink-0">
          <Wordmark />
        </Link>

        <nav aria-label="ניווט ראשי" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-[0.95rem] font-medium text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink",
                isActive(item.href) && "bg-leaf-50 text-leaf-800 hover:bg-leaf-50",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {account}
          <Link href="/projects/new" className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}>
            <Plus /> הוספת מיזם
          </Link>
          <Link
            href="/projects/new"
            aria-label="הוספת מיזם"
            className={cn(buttonVariants({ size: "sm" }), "sm:hidden !px-3")}
          >
            <Plus />
          </Link>
          <button
            type="button"
            aria-label={open ? "סגירת תפריט" : "פתיחת תפריט"}
            aria-expanded={open}
            onClick={() => setOpenPath(open ? null : pathname)}
            className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-paper-2 md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav aria-label="ניווט ראשי" className="border-t border-line/70 bg-paper/95 md:hidden">
          <div className="page-wrap flex flex-col gap-1 py-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-2xl px-4 py-3 text-base font-medium text-ink-2 hover:bg-paper-2",
                  isActive(item.href) && "bg-leaf-50 text-leaf-800",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
