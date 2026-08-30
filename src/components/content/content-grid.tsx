import { ContentCard } from "./content-card";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";
import type { ContentCardModel } from "@/types/content";

export type ContentGridProps = {
  items: ContentCardModel[];
  /** Shown when the list is empty — always give the reader a way forward. */
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  priorityCount?: number;
  className?: string;
};

export function ContentGrid({
  items,
  emptyTitle = "Nothing here yet",
  emptyDescription = "No recordings match this view. Try a different subject or clear your filters.",
  emptyAction,
  priorityCount = 4,
  className,
}: ContentGridProps) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
        className,
      )}
    >
      {items.map((item, index) => (
        <ContentCard key={item.id} content={item} priority={index < priorityCount} />
      ))}
    </div>
  );
}
