import Link from "next/link";
import { routes } from "@/config/routes";
import { categoryIcon } from "@/config/category-icons";
import { pluralize } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { CategorySummary } from "@/types/content";

export type CategoryCardProps = {
  category: CategorySummary;
  /** One-line summary, shown on the subjects index but not in dense grids. */
  description?: string;
  /** Compact drops the icon — used in dense sidebars and filter lists. */
  compact?: boolean;
  className?: string;
};

export function CategoryCard({
  category,
  description,
  compact = false,
  className,
}: CategoryCardProps) {
  const Icon = categoryIcon(category.slug);

  return (
    <Link
      href={routes.category(category.slug)}
      className={cn(
        "group flex items-center gap-3 rounded-card border border-line bg-surface",
        "px-4 py-3.5 transition-colors hover:border-accent/50 hover:bg-raised",
        className,
      )}
    >
      {compact ? null : (
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-control",
            "border border-line bg-raised text-ink-muted transition-colors",
            "group-hover:border-accent/40 group-hover:text-accent",
          )}
        >
          <Icon className="size-4" />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-card font-semibold text-ink transition-colors group-hover:text-accent-strong">
          {category.name}
        </span>
        <span className="slate mt-0.5 block tabular-nums">
          {pluralize(category.contentCount, "recording")}
        </span>
        {description ? (
          <span className="mt-1.5 line-clamp-2 block text-meta text-ink-faint">{description}</span>
        ) : null}
      </span>
    </Link>
  );
}
