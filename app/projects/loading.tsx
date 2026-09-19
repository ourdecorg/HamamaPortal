import { CardGridSkeleton, PageHeaderSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-16" role="status" aria-label="טוענים מיזמים">
      <PageHeaderSkeleton />
      <div className="skeleton mb-8 h-14 w-full rounded-full" />
      <CardGridSkeleton />
    </div>
  );
}
