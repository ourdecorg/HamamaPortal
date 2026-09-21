import { LogOut, UserRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { Link } from "@/components/LocaleLink";
import { buttonVariants } from "@/components/ui/button";
import { displayNameOf, getCurrentUser } from "@/lib/auth";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";

/**
 * The account corner of the header (a Server Component, rendered into SiteHeader's slot).
 * Visitors see "Sign in"; signed-in people see their space and a sign-out button.
 * Nothing is shown when Supabase is not configured (demo mode).
 */
export async function AccountMenu() {
  if (!isSupabaseConfigured()) return null;
  const m = (await getMessages()).account;
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
        <UserRound className="sm:hidden" aria-hidden="true" />
        <span className="hidden sm:inline">{m.signIn}</span>
        <span className="sr-only sm:hidden">{m.signIn}</span>
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Link
        href="/my-space"
        title={displayNameOf(user, m.fallbackName)}
        className={cn(buttonVariants({ variant: "soft", size: "sm" }))}
      >
        <UserRound aria-hidden="true" />
        <span className="hidden sm:inline">{m.mySpace}</span>
        <span className="sr-only sm:hidden">{m.mySpace}</span>
      </Link>
      <form action={signOut}>
        <input type="hidden" name="locale" value={await getLocale()} />
        <button
          type="submit"
          aria-label={m.signOut}
          title={m.signOut}
          className="grid size-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
