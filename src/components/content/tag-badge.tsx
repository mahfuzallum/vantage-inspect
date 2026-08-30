import Link from "next/link";
import { routes } from "@/config/routes";
import { cn } from "@/lib/utils/cn";
import type { TagSummary } from "@/types/content";

export function TagBadge({
  tag,
  showCount = false,
  className,
}: {
  tag: Pick<TagSummary, "slug" | "name"> & Partial<Pick<TagSummary, "contentCount">>;
  showCount?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={routes.tag(tag.slug)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-raised",
        "px-2.5 py-1 font-mono text-2xs uppercase tracking-wider text-ink-muted",
        "transition-colors hover:border-accent/50 hover:text-accent",
        className,
      )}
    >
      {tag.name}
      {showCount && tag.contentCount != null ? (
        <span className="tabular-nums text-ink-faint">{tag.contentCount}</span>
      ) : null}
    </Link>
  );
}
