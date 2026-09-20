import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { buttonVariants } from "@/components/ui/button";
import { displayNameOf, getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";

/**
 * The account corner of the header (a Server Component, rendered into SiteHeader's slot).
 * Visitors see "כניסה"; signed-in people see their space and a sign-out button.
 * Nothing is shown when Supabase is not configured (demo mode).
 */
export async function AccountMenu() {
  if (!isSupabaseConfigured()) return null;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
        <UserRound className="sm:hidden" aria-hidden="true" />
        <span className="hidden sm:inline">כניסה</span>
        <span className="sr-only sm:hidden">כניסה</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Link
        href="/my-space"
        title={displayNameOf(user)}
        className={cn(buttonVariants({ variant: "soft", size: "sm" }))}
      >
        <UserRound aria-hidden="true" />
        <span className="hidden sm:inline">המרחב שלי</span>
        <span className="sr-only sm:hidden">המרחב שלי</span>
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          aria-label="יציאה"
          title="יציאה"
          className="grid size-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
