import { Container } from "@/components/layout/container";
import { ContentGridSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * Loading shell for every browse surface.
 *
 * Mirrors ContentListing's geometry — header, filter bar, grid — so nothing
 * shifts when the real page resolves. One implementation rather than a
 * per-route variant, which is what keeps the states consistent.
 */
export function ListingSkeleton({ showFilters = true }: { showFilters?: boolean }) {
  return (
    <Container className="py-8 sm:py-10">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-full max-w-md" />

      {showFilters ? (
        <div className="mt-8 space-y-4 border-b border-line pb-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-40" />
          </div>
          <div className="hidden gap-3 lg:grid lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-14" />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <ContentGridSkeleton count={8} />
      </div>
    </Container>
  );
}
