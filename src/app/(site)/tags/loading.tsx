import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-8 sm:py-10">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-3 h-8 w-40" />
      <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      <div role="status" aria-label="Loading topics" className="mt-8 flex flex-wrap gap-2">
        {Array.from({ length: 24 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-24 rounded-full" />
        ))}
      </div>
    </Container>
  );
}
