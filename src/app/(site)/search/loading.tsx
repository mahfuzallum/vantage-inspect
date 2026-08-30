import { Container } from "@/components/layout/container";
import { ContentGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-8 sm:py-10">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-3 h-8 w-80 max-w-full" />
      <Skeleton className="mt-4 h-12 w-full max-w-2xl rounded-control" />
      <div className="mt-8">
        <ContentGridSkeleton count={8} />
      </div>
    </Container>
  );
}
