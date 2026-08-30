import { cn } from "@/lib/utils/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("shimmer rounded-control", className)} />;
}

/**
 * Every skeleton below mirrors the geometry of the component it stands in for,
 * so nothing shifts when real content arrives. They are decorative: one
 * `role="status"` on the wrapper announces the load, and the shapes inside are
 * hidden from assistive technology.
 */

export function ContentCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-video w-full rounded-card" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function ContentGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading recordings"
      className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {Array.from({ length: count }, (_, index) => (
        <ContentCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function FeaturedSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading featured recordings"
      className="grid gap-6 lg:grid-cols-[1.6fr_1fr]"
    >
      <div className="space-y-3">
        <Skeleton className="aspect-video w-full rounded-card" />
        <Skeleton className="h-6 w-4/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
        {Array.from({ length: 3 }, (_, index) => (
          <ContentCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

export function CreatorCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-4">
      <Skeleton className="size-14 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

export function CreatorGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading contributors"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, index) => (
        <CreatorCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function CategoryGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading subjects"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-[4.5rem] rounded-card" />
      ))}
    </div>
  );
}

export function RailSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading trending recordings"
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:flex lg:gap-5 lg:overflow-hidden"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex gap-3 lg:w-[19rem] lg:shrink-0 lg:flex-col lg:gap-3">
          <Skeleton className="aspect-video w-32 shrink-0 rounded-card sm:w-36 lg:w-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-10/12" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MediaPlayerSkeleton() {
  return (
    <div role="status" aria-label="Loading media">
      <Skeleton className="aspect-video w-full rounded-card" />
    </div>
  );
}

export function RelatedContentSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading related recordings"
      className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4"
    >
      {Array.from({ length: count }, (_, index) => (
        <ContentCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function ContentDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading recording">
      <Skeleton className="h-3 w-48" />
      <div className="mt-4">
        <MediaPlayerSkeleton />
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-3 w-64" />
          <div className="space-y-2 pt-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-9/12" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-20 rounded-card" />
        </div>
      </div>
    </div>
  );
}

export function CreatorProfileSkeleton() {
  return (
    <div role="status" aria-label="Loading contributor">
      <div className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 sm:flex-row">
        <Skeleton className="size-[5.5rem] shrink-0 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
      </div>
    </div>
  );
}
