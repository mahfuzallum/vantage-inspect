"use client";

import Link from "next/link";
import { BadgeCheck, Eye, Play } from "lucide-react";

import { routes } from "@/config/routes";
import {
  formatCount,
  formatDuration,
  formatRelativeTime,
} from "@/lib/utils/format";

import { TimecodeBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";

import { VideoPreview } from "./video-preview";
import { cn } from "@/lib/utils/cn";

import type { ContentCardModel } from "@/types/content";

export type ContentCardSize =
  | "default"
  | "compact"
  | "feature";

export type ContentCardProps = {
  content: ContentCardModel;
  size?: ContentCardSize;
  priority?: boolean;
  showCategory?: boolean;
  className?: string;
};

const TITLE_SIZE: Record<
  ContentCardSize,
  string
> = {
  default:
    "text-[0.95rem] sm:text-base",

  compact:
    "text-sm",

  feature:
    "text-xl sm:text-2xl",
};

const IMAGE_SIZES: Record<
  ContentCardSize,
  string
> = {
  default:
    "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1400px) 25vw, 20vw",

  compact:
    "(max-width: 640px) 80vw, 20rem",

  feature:
    "(max-width: 1024px) 100vw, 60vw",
};

/**
 * Smart Link configuration.
 *
 * TEMPORARY TEST VALUE.
 *
 * This will later be controlled from:
 *
 * Admin Panel
 *   ↓
 * Database
 *   ↓
 * Monetization settings
 */
const SMART_LINK_ENABLED = true;

const SMART_LINK_URL =
  "https://YOUR-SMART-LINK-HERE.com";

/**
 * Number of video clicks that should trigger
 * the Smart Link.
 *
 * 1 = first click
 * 2 = first two clicks
 * 3 = first three clicks
 */
const SMART_LINK_TRIGGER_COUNT = 2;

/**
 * Session-based counter.
 *
 * The visitor gets a fresh counter when a new
 * browser session starts.
 */
const SMART_LINK_STORAGE_KEY =
  "video-smart-link-click-count";

/**
 * Opens the Smart Link in a new tab.
 *
 * The current website remains open.
 *
 * Returns true when an attempt to open the
 * Smart Link was made successfully.
 */
function openSmartLink(): boolean {
  /**
   * Smart Link disabled.
   */
  if (!SMART_LINK_ENABLED) {
    return false;
  }

  /**
   * Do not try to open the placeholder URL.
   */
  if (
    !SMART_LINK_URL ||
    SMART_LINK_URL.includes(
      "YOUR-SMART-LINK-HERE",
    )
  ) {
    return false;
  }

  try {
    /**
     * Read current click count.
     */
    const currentCount = Number(
      window.sessionStorage.getItem(
        SMART_LINK_STORAGE_KEY,
      ) ?? "0",
    );

    /**
     * Trigger limit already reached.
     */
    if (
      currentCount >=
      SMART_LINK_TRIGGER_COUNT
    ) {
      return false;
    }

    /**
     * Increase click count.
     */
    window.sessionStorage.setItem(
      SMART_LINK_STORAGE_KEY,
      String(currentCount + 1),
    );

    /**
     * Open Smart Link in a separate tab.
     *
     * The main website stays open.
     */
    const popup = window.open(
      SMART_LINK_URL,
      "_blank",
      "noopener,noreferrer",
    );

    return Boolean(popup);
  } catch {
    /**
     * sessionStorage or popup may be blocked
     * by the browser.
     *
     * Never break normal video navigation.
     */
    return false;
  }
}

export function ContentCard({
  content,
  size = "default",
  priority,
  showCategory = true,
  className,
}: ContentCardProps) {
  /**
   * Handles video-card clicks.
   *
   * IMPORTANT:
   *
   * We do not call preventDefault().
   *
   * Therefore:
   *
   * 1. Smart Link opens in a new tab.
   * 2. The current tab continues to the video page.
   */
  function handleVideoClick() {
    openSmartLink();
  }

  return (
    <article
      className={cn(
        "group relative min-w-0",
        "transition-transform duration-300 ease-out hover:-translate-y-1",
        className,
      )}
    >
      <div
        className={cn(
          "relative aspect-video overflow-hidden rounded-xl border border-white/[0.07] bg-[#111118]",
          "shadow-[0_12px_30px_rgba(0,0,0,0.22)] transition duration-300",
          "group-hover:border-[#8B5CF6]/45 group-hover:shadow-[0_18px_44px_rgba(139,92,246,0.22)]",
        )}
      >
        {/**
         * Main video link.
         *
         * Smart Link is handled by onClick.
         * Normal navigation continues normally.
         */}
        <Link
          href={routes.content(
            content.slug,
          )}
          aria-label={`Watch ${content.title}`}
          className="absolute inset-0 z-10"
          onClick={
            handleVideoClick
          }
        />

        <VideoPreview
          poster={
            content.thumbnailUrl
          }
          previewUrl={
            content.previewUrl
          }
          seed={
            content.slug
          }
          sizes={
            IMAGE_SIZES[size]
          }
          priority={
            priority
          }
        />

        {/**
         * Play button overlay.
         */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 z-20 flex items-center justify-center",
            "opacity-0 transition-opacity duration-300 group-hover:opacity-100",
          )}
        >
          <span
            className={cn(
              "flex items-center justify-center rounded-full bg-[#8B5CF6] text-white",
              "shadow-[0_8px_24px_rgba(139,92,246,0.45)]",
              "scale-90 transition-transform duration-300 group-hover:scale-100",
              size === "compact"
                ? "size-9"
                : "size-12",
            )}
          >
            <Play
              className={cn(
                "translate-x-px fill-current",
                size === "compact"
                  ? "size-4"
                  : "size-5",
              )}
            />
          </span>
        </div>

        {/**
         * Video label.
         */}
        <div
          className="
            pointer-events-none
            absolute
            left-3
            top-3
            z-20
            flex
            items-center
            gap-1.5
            rounded-md
            bg-black/65
            px-2
            py-1
            text-[10px]
            font-semibold
            uppercase
            tracking-[0.08em]
            text-white/90
            backdrop-blur-sm
          "
        >
          <Play
            className="size-3 fill-current"
            aria-hidden="true"
          />

          Video
        </div>

        {/**
         * Video duration.
         */}
        {content.durationSeconds ? (
          <TimecodeBadge
            value={formatDuration(
              content.durationSeconds,
            )}
            className="
              absolute
              bottom-3
              right-3
              z-20
              border-0
              bg-black/75
              text-white
            "
          />
        ) : null}
      </div>

      {/**
       * Content information.
       */}
      <div className="mt-3 min-w-0 space-y-1.5">
        <h3
          className={cn(
            "clamp-2 font-display font-semibold leading-snug text-white transition-colors group-hover:text-[#a78bfa]",
            TITLE_SIZE[size],
          )}
        >
          {content.title}
        </h3>

        {/**
         * Feature-card summary.
         */}
        {size === "feature" &&
        content.summary ? (
          <p className="clamp-2 text-meta text-white/55">
            {content.summary}
          </p>
        ) : null}

        {/**
         * Creator.
         */}
        {content.creator ? (
          <Link
            href={routes.creator(
              content.creator.slug,
            )}
            className="
              relative
              z-20
              flex
              min-w-0
              items-center
              gap-2
              text-meta
              text-white/55
              transition-colors
              hover:text-[#a78bfa]
            "
          >
            <Avatar
              name={
                content.creator.name
              }
              src={
                content.creator.avatarUrl
              }
              size="sm"
              className="
                size-5
                border-white/10
                bg-white/[0.04]
              "
            />

            <span className="truncate">
              {
                content.creator.name
              }
            </span>

            {content.creator
              .isVerified ? (
              <BadgeCheck
                className="
                  size-3.5
                  shrink-0
                  text-[#A78BFA]
                "
                aria-label="Verified"
              />
            ) : null}
          </Link>
        ) : null}

        {/**
         * Views, date and category.
         */}
        <div
          className="
            flex
            flex-wrap
            items-center
            gap-x-2
            text-[11px]
            text-white/35
          "
        >
          <span className="flex items-center gap-1">
            <Eye
              className="size-3"
              aria-hidden="true"
            />

            {formatCount(
              content.viewCount,
            )}
          </span>

          {content.publishedAt ? (
            <>
              <span aria-hidden="true">
                ·
              </span>

              <time
                dateTime={content.publishedAt.toISOString()}
              >
                {formatRelativeTime(
                  content.publishedAt,
                )}
              </time>
            </>
          ) : null}

          {showCategory &&
          content.category ? (
            <>
              <span aria-hidden="true">
                ·
              </span>

              <Link
                href={routes.category(
                  content.category.slug,
                )}
                className="
                  relative
                  z-20
                  hover:text-[#a78bfa]
                "
              >
                {
                  content.category.name
                }
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}