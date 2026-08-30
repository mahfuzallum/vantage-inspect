import Link from "next/link";
import { Eye } from "lucide-react";
import { routes } from "@/config/routes";
import { Thumbnail } from "@/components/ui/thumbnail";
import { TimecodeBadge } from "@/components/ui/badge";
import { formatCount, formatDuration } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { ContentCardModel } from "@/types/content";

/**
 * Trending row. Rank is genuine information here — these items are ordered by
 * view volume — so the numeral is given real weight rather than used as
 * decoration. Outlined numerals keep the sequence legible without competing
 * with the thumbnails.
 *
 * Horizontal and scroll-snapped from tablet up; stacks into a plain list on
 * phones, where a sideways scroll inside a vertical page is awkward.
 */
export function TrendingRail({
  items,
  className,
}: {
  items: ContentCardModel[];
  className?: string;
}) {
  return (
    <ol
      className={cn(
        "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:flex lg:gap-5 lg:overflow-x-auto",
        "lg:snap-x lg:snap-mandatory lg:pb-1 lg:[scrollbar-width:none]",
        "lg:[&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item, index) => (
        <li
          key={item.id}
          className="group relative flex gap-3 lg:w-[19rem] lg:shrink-0 lg:snap-start lg:flex-col lg:gap-3"
        >
          <div className="flex items-start gap-3 lg:contents">
            <span
              aria-hidden="true"
              className={cn(
                "rank-numeral shrink-0 pt-1 lg:absolute lg:left-2 lg:top-1 lg:z-10 lg:pt-0",
                index === 0 && "rank-numeral-lead",
              )}
            >
              {index + 1}
            </span>

            <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-card border border-line bg-sunken sm:w-36 lg:w-full">
              <Thumbnail
                src={item.thumbnailUrl}
                alt=""
                seed={item.slug}
                sizes="(max-width: 1024px) 40vw, 19rem"
              />
              {item.durationSeconds ? (
                <TimecodeBadge
                  value={formatDuration(item.durationSeconds)}
                  className="absolute bottom-1.5 right-1.5"
                />
              ) : null}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="clamp-2 font-display text-card font-semibold leading-snug text-ink">
              <Link
                href={routes.content(item.slug)}
                className="after:absolute after:inset-0 hover:text-accent-strong"
              >
                {item.title}
              </Link>
            </h3>
            {item.creator ? (
              <p className="truncate text-meta text-ink-muted">{item.creator.name}</p>
            ) : null}
            <p className="slate flex items-center gap-1.5">
              <Eye className="size-3" aria-hidden="true" />
              <span className="tabular-nums">{formatCount(item.viewCount)} views</span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
