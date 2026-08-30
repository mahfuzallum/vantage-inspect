import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading your account">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40 rounded-panel" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-card" />
        ))}
      </div>
    </div>
  );
}
