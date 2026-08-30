import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-8" role="status" aria-label="Loading admin">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-3 h-8 w-64" />
      <Skeleton className="mt-6 h-56 rounded-panel" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-card" />
        ))}
      </div>
    </Container>
  );
}
