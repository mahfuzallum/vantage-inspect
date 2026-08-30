import Link from "next/link";
import { Bookmark, Eye, ThumbsUp } from "lucide-react";
import { VideoPreview } from "./video-preview";
import { routes } from "@/config/routes";
import {
  formatCount,
  formatDuration,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { ContentCardModel } from "@/types/content";

function approvalPercent(
  likes: number,
  dislikes: number,
): number | null {
  const total = likes + dislikes;

  if (total === 0) {
    return null;
  }

  return Math.round((likes / total) * 100);
}

function isoDate(date: Date | null): string {
  if (!date) {
    return "";
  }

  return date
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

export function ArchiveCard({
  content,
  priority = false,
  className,
}: {
  content: ContentCardModel;
  priority?: boolean;
  className?: string;
}) {
  const href = routes.content(content.slug);

  const approval = approvalPercent(
    content.likeCount,
    content.dislikeCount,
  );

  const quality =
    (content.durationSeconds ?? 0) > 0
      ? "HD"
      : null;

  return (
    <article
      className={cn(
        "group relative w-full min-w-0",
        className,
      )}
    >
      {/* Video thumbnail */}
      <div
        className="
          relative
          aspect-video
          w-full
          overflow-hidden
          rounded-xl
          border
          border-white/[0.08]
          bg-[#111118]
          transform-gpu
          will-change-transform
          shadow-[0_6px_24px_rgba(0,0,0,0.16)]
          transition-[transform,box-shadow,border-color]
          duration-300
          ease-[cubic-bezier(0.22,1,0.36,1)]
          group-hover:-translate-y-1
          group-hover:border-white/[0.16]
          group-hover:shadow-[0_18px_45px_rgba(0,0,0,0.32)]
          motion-reduce:transform-none
          motion-reduce:transition-none
        "
      >
        <VideoPreview
          poster={content.thumbnailUrl}
          previewUrl={content.previewUrl}
          seed={content.slug}
          alt={content.title}
          priority={priority}
          sizes="
            (min-width: 1536px) 16vw,
            (min-width: 1280px) 16vw,
            (min-width: 1024px) 25vw,
            (min-width: 640px) 50vw,
            100vw
          "
        />

        {/* Smooth hover zoom layer */}
        <div
          className="
            pointer-events-none
            absolute
            inset-0
            z-[4]
            rounded-xl
            bg-transparent
            transition-transform
            duration-500
            ease-[cubic-bezier(0.22,1,0.36,1)]
            group-hover:scale-[1.018]
            motion-reduce:transform-none
            motion-reduce:transition-none
          "
        />

        {/* Bottom overlay */}
        <div
          className="
            pointer-events-none
            absolute
            inset-x-0
            bottom-0
            z-[5]
            h-24
            bg-gradient-to-t
            from-black/65
            via-black/10
            to-transparent
          "
        />

        {/* Duration */}
        {content.durationSeconds ? (
          <span
            className="
              pointer-events-none
              absolute
              bottom-2
              right-2
              z-20
              rounded-md
              border
              border-white/10
              bg-black/80
              px-2
              py-1
              font-mono
              text-[10px]
              font-semibold
              leading-4
              tracking-wide
              text-white/90
              shadow-lg
              backdrop-blur-sm
              transition-transform
              duration-300
              ease-out
              group-hover:-translate-y-0.5
            "
          >
            {quality ? (
              <span className="mr-1.5 text-[#C4B5FD]">
                {quality}
              </span>
            ) : null}

            {formatDuration(
              content.durationSeconds,
            )}
          </span>
        ) : null}

        {/* Video link */}
        <Link
          href={href}
          prefetch
          aria-label={`Open ${content.title}`}
          className="
            absolute
            inset-0
            z-10
            block
            cursor-pointer
            rounded-xl
            outline-none
            transition-transform
            duration-150
            ease-out
            active:scale-[0.992]
            focus-visible:ring-2
            focus-visible:ring-[#A78BFA]
            focus-visible:ring-offset-2
            focus-visible:ring-offset-[#0b0b10]
          "
        >
          <span className="sr-only">
            {content.title}
          </span>
        </Link>
      </div>

      {/* Information */}
      <div
        className="
          min-w-0
          px-0.5
          pt-2.5
          transition-transform
          duration-300
          ease-[cubic-bezier(0.22,1,0.36,1)]
          group-hover:-translate-y-0.5
          motion-reduce:transform-none
          motion-reduce:transition-none
        "
      >
        {/* Title */}
        <Link
          href={href}
          prefetch
          title={content.title}
          className="
            block
            truncate
            text-[13px]
            font-semibold
            leading-5
            text-white/90
            transition-colors
            duration-200
            ease-out
            hover:text-white
          "
        >
          {content.title}
        </Link>

        {/* Creator */}
        {content.creator ? (
          <Link
            href={routes.creator(
              content.creator.slug,
            )}
            prefetch
            className="
              mt-0.5
              block
              truncate
              text-[11px]
              font-medium
              leading-4
              text-[#A78BFA]
              transition-colors
              duration-200
              ease-out
              hover:text-[#C4B5FD]
            "
          >
            {content.creator.name}
          </Link>
        ) : null}

        {/* Metadata */}
        <div
          className="
            mt-1.5
            flex
            min-w-0
            flex-wrap
            items-center
            gap-x-2.5
            gap-y-0.5
            font-mono
            text-[9px]
            leading-4
            text-white/38
          "
        >
          <span className="inline-flex items-center gap-1">
            <Eye
              className="size-3"
              aria-hidden="true"
            />

            {formatCount(
              content.viewCount,
            )}
          </span>

          {content.publishedAt ? (
            <time
              dateTime={
                content.publishedAt.toISOString()
              }
            >
              {isoDate(
                content.publishedAt,
              )}
            </time>
          ) : null}

          {approval !== null ? (
            <span className="inline-flex items-center gap-1">
              <ThumbsUp
                className="size-3"
                aria-hidden="true"
              />

              {approval}%
            </span>
          ) : null}

          {content.favoriteCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Bookmark
                className="size-3"
                aria-hidden="true"
              />

              {formatCount(
                content.favoriteCount,
              )}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/*
 * Responsive archive grid.
 *
 * Home uses columns={6}.
 *
 * Desktop:
 * 6 large cards per row.
 *
 * Mobile/tablet automatically reduce columns.
 */
const COLUMN_CLASSES: Record<number, string> = {
  4:
    "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",

  5:
    "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",

  6:
    "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",

  7:
    "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7",
};

export function ArchiveGrid({
  items,
  priorityCount = 0,
  columns = 4,
  className,
}: {
  items: ContentCardModel[];
  priorityCount?: number;
  columns?: 4 | 5 | 6 | 7;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid w-full",
        "grid-flow-row",
        "gap-x-4 gap-y-9",
        "sm:gap-x-4 sm:gap-y-10",
        COLUMN_CLASSES[columns] ??
          COLUMN_CLASSES[4],
        className,
      )}
    >
      {items.map((item, index) => (
        <ArchiveCard
          key={item.id}
          content={item}
          priority={index < priorityCount}
        />
      ))}
    </div>
  );
}