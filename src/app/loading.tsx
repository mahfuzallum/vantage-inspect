import { Container } from "@/components/layout/container";
import { ContentGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-12">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-10 w-2/3 max-w-xl" />
      <Skeleton className="mt-3 h-4 w-1/2 max-w-md" />
      <div className="mt-10">
        <ContentGridSkeleton count={8} />
      </div>
    </Container>
  );
}
