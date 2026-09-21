import { ConnectionSkeleton, PageHeaderSkeleton } from "@/components/Skeletons";
import { getMessages } from "@/lib/i18n/server";

export default async function Loading() {
  const m = (await getMessages()).common;
  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-16" role="status" aria-label={m.loadingConnections}>
      <PageHeaderSkeleton />
      <div className="space-y-8">
        <ConnectionSkeleton />
        <ConnectionSkeleton />
      </div>
    </div>
  );
}
