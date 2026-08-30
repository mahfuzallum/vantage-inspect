import { Container } from "@/components/layout/container";
import {
  CategoryGridSkeleton,
  ContentGridSkeleton,
  FeaturedSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

/** Mirrors the home layout so nothing jumps when the real page resolves. */
export default function SiteLoading() {
  return (
    <>
      <div className="border-b border-line bg-surface/40">
        <Container className="py-10 sm:py-14">
          <Skeleton className="h-3 w-56" />
          <Skeleton className="mt-4 h-10 w-full max-w-lg" />
          <Skeleton className="mt-3 h-4 w-full max-w-xl" />
          <Skeleton className="mt-6 h-12 w-full max-w-2xl rounded-control" />
        </Container>
      </div>

      <Container className="py-12">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-7 w-64" />
        <div className="mt-6">
          <FeaturedSkeleton />
        </div>
      </Container>

      <Container className="pb-12">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-56" />
        <div className="mt-6">
          <ContentGridSkeleton count={8} />
        </div>
      </Container>

      <Container className="pb-14">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-3 h-7 w-48" />
        <div className="mt-6">
          <CategoryGridSkeleton />
        </div>
      </Container>
    </>
  );
}
