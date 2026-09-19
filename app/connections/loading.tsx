import { ConnectionSkeleton, PageHeaderSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-16" role="status" aria-label="מחפשים חיבורים">
      <PageHeaderSkeleton />
      <div className="space-y-8">
        <ConnectionSkeleton />
        <ConnectionSkeleton />
      </div>
    </div>
  );
}
