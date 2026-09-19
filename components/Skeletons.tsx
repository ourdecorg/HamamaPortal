import { cn } from "@/lib/utils";

/** Loading skeletons: same silhouette as the content they stand in for. */

export function PageHeaderSkeleton() {
  return (
    <div className="mb-10 space-y-4" aria-hidden="true">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton h-14 w-3/4 max-w-lg" />
      <div className="skeleton h-5 w-full max-w-xl" />
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-4 rounded-[1.75rem] border border-line bg-white/60 p-6">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-8 w-2/3" />
          <div className="skeleton h-4 w-full" />
          <div className="flex gap-2">
            <div className="skeleton h-6 w-16 !rounded-full" />
            <div className="skeleton h-6 w-20 !rounded-full" />
          </div>
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ConnectionSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("space-y-5 rounded-[2rem] border border-line bg-white/60 p-7", className)}>
      <div className="skeleton h-4 w-32" />
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <div className="skeleton h-40" />
        <div className="skeleton mx-auto size-11 !rounded-full" />
        <div className="skeleton h-40" />
      </div>
      <div className="skeleton h-5 w-2/3" />
    </div>
  );
}
