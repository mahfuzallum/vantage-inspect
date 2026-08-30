import { Container } from "@/components/layout/container";
import { ContentGridSkeleton, CreatorProfileSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-8 sm:py-10">
      <Skeleton className="h-3 w-56" />
      <Skeleton className="mt-4 h-8 w-64" />
      <div className="mt-8">
        <CreatorProfileSkeleton />
      </div>
      <div className="mt-8">
        <ContentGridSkeleton count={8} />
      </div>
    </Container>
  );
}
