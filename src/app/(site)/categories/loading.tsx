import { Container } from "@/components/layout/container";
import { CategoryGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-8 sm:py-10">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-3 h-8 w-48" />
      <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      <div className="mt-8">
        <CategoryGridSkeleton count={9} />
      </div>
    </Container>
  );
}
