import { PageHeaderSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-16" role="status" aria-label="מחפשים">
      <PageHeaderSkeleton />
      <div className="skeleton mb-12 h-32 w-full max-w-3xl rounded-[1.75rem]" />
      <div className="skeleton mb-6 h-32 w-full" />
      <div className="space-y-5">
        <div className="skeleton h-56 w-full !rounded-[2rem]" />
        <div className="skeleton h-56 w-full !rounded-[2rem]" />
      </div>
    </div>
  );
}
