import type { Metadata } from "next";
import { ResumeWish } from "@/components/ResumeWish";
import { WishForm } from "@/components/WishForm";
import { getCurrentUser } from "@/lib/auth";
import { getMessages } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function generateMetadata(): Promise<Metadata> {
  return (await getMessages()).meta.wishes;
}

export default async function WishesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const m = (await getMessages()).wish;
  const q = (typeof sp.q === "string" ? sp.q : "").slice(0, 600);
  const canSave = isSupabaseConfigured();
  const signedIn = canSave && Boolean(await getCurrentUser());

  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-16">
      <div className="mx-auto max-w-3xl">
        <header className="mb-12 text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-sun/25 px-4 py-1.5 text-sm font-semibold text-need-700">
            {m.eyebrow}
            {m.eyebrowAlt && (
              <>
                <span className="text-need-700/50">·</span>
                <span dir="ltr">{m.eyebrowAlt}</span>
              </>
            )}
          </p>
          <h1 className="font-display text-5xl font-semibold leading-tight text-leaf-900 sm:text-7xl">{m.title}</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-2">{m.body}</p>
        </header>

        {sp.resume && <ResumeWish />}
        <WishForm initialWish={q} canSave={canSave} signedIn={signedIn} />
      </div>
    </div>
  );
}
