"use client";

import Link from "next/link";
import { BadgeCheck, Eye, Play } from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

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
 * Smart Link configuration returned by /api/monetization.
 */
type SmartLinkSettings = {
  enabled: boolean;
  url: string;
  triggerCount: number;
  triggerMode:
    | "fixed"
    | "random_2_3"
    | "random_3_5";
};

/**
 * Storage prefixes.
 *
 * The counter and selected random threshold are stored separately.
 * This makes every video independent.
 */
const SMART_LINK_CLICK_PREFIX =
  "smart-link-clicks:";

const SMART_LINK_THRESHOLD_PREFIX =
  "smart-link-threshold:";

/**
 * Safe default.
 *
 * If the API is temporarily unavailable, normal video navigation is allowed.
 */
const DEFAULT_SMART_LINK_SETTINGS: SmartLinkSettings =
  {
    enabled: false,
    url: "",
    triggerCount: 3,
    triggerMode: "fixed",
  };

/**
 * Build the storage key for a video.
 */
function getClickStorageKey(
  slug: string,
): string {
  return `${SMART_LINK_CLICK_PREFIX}${slug}`;
}

/**
 * Build the storage key for the selected threshold.
 */
function getThresholdStorageKey(
  slug: string,
): string {
  return `${SMART_LINK_THRESHOLD_PREFIX}${slug}`;
}

/**
 * Read a positive integer from sessionStorage.
 */
function readStoredNumber(
  key: string,
): number | null {
  try {
    const value =
      window.sessionStorage.getItem(
        key,
      );

    if (value === null) {
      return null;
    }

    const number = Number(value);

    if (
      !Number.isInteger(number) ||
      number < 0
    ) {
      return null;
    }

    return number;
  } catch {
    return null;
  }
}

/**
 * Save a number to sessionStorage.
 */
function saveStoredNumber(
  key: string,
  value: number,
): void {
  try {
    window.sessionStorage.setItem(
      key,
      String(value),
    );
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Remove a stored value.
 */
function removeStoredValue(
  key: string,
): void {
  try {
    window.sessionStorage.removeItem(
      key,
    );
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Return a random integer between min and max, inclusive.
 */
function randomInteger(
  min: number,
  max: number,
): number {
  return (
    Math.floor(
      Math.random() *
        (max - min + 1),
    ) + min
  );
}

/**
 * Select the Smart Link threshold.
 *
 * fixed:
 *   Uses the Admin configured count.
 *
 * random_2_3:
 *   Randomly chooses 2 or 3.
 *
 * random_3_5:
 *   Randomly chooses 3, 4 or 5.
 */
function getThresholdForMode(
  settings: SmartLinkSettings,
): number {
  if (
    settings.triggerMode ===
    "random_2_3"
  ) {
    return randomInteger(2, 3);
  }

  if (
    settings.triggerMode ===
    "random_3_5"
  ) {
    return randomInteger(3, 5);
  }

  return Math.min(
    20,
    Math.max(
      1,
      Math.floor(
        settings.triggerCount,
      ),
    ),
  );
}

/**
 * Validate a Smart Link URL.
 */
function isValidSmartLinkUrl(
  value: string,
): boolean {
  if (!value) {
    return false;
  }

  if (
    value.includes(
      "YOUR-SMART-LINK-HERE",
    )
  ) {
    return false;
  }

  try {
    const url =
      new URL(value);

    return (
      url.protocol ===
        "http:" ||
      url.protocol ===
        "https:"
    );
  } catch {
    return false;
  }
}

/**
 * Fetch the current monetization settings.
 */
async function fetchSmartLinkSettings(): Promise<SmartLinkSettings> {
  try {
    const response =
      await fetch(
        "/api/monetization",
        {
          method: "GET",
          cache: "no-store",
          credentials:
            "same-origin",
        },
      );

    if (!response.ok) {
      return (
        DEFAULT_SMART_LINK_SETTINGS
      );
    }

    const data =
      (await response.json()) as {
        smartLinkEnabled?: unknown;
        smartLinkUrl?: unknown;
        smartLinkTriggerCount?: unknown;
        smartLinkTriggerMode?: unknown;
      };

    const triggerCount =
      Number(
        data.smartLinkTriggerCount ??
          3,
      );

    const safeTriggerCount =
      Number.isInteger(
        triggerCount,
      )
        ? Math.min(
            20,
            Math.max(
              1,
              triggerCount,
            ),
          )
        : 3;

    const triggerMode =
      data.smartLinkTriggerMode ===
        "random_2_3" ||
      data.smartLinkTriggerMode ===
        "random_3_5"
        ? data.smartLinkTriggerMode
        : "fixed";

    const url =
      typeof data.smartLinkUrl ===
      "string"
        ? data.smartLinkUrl.trim()
        : "";

    return {
      enabled:
        Boolean(
          data.smartLinkEnabled,
        ),

      url,

      triggerCount:
        safeTriggerCount,

      triggerMode,
    };
  } catch {
    return (
      DEFAULT_SMART_LINK_SETTINGS
    );
  }
}

export function ContentCard({
  content,
  size = "default",
  priority,
  showCategory = true,
  className,
}: ContentCardProps) {
  const [
    smartLinkSettings,
    setSmartLinkSettings,
  ] = useState<SmartLinkSettings>(
    DEFAULT_SMART_LINK_SETTINGS,
  );

  /**
   * Load Smart Link configuration
   * when the card mounts.
   */
  useEffect(() => {
    let active = true;

    fetchSmartLinkSettings().then(
      (settings) => {
        if (active) {
          setSmartLinkSettings(
            settings,
          );
        }
      },
    );

    return () => {
      active = false;
    };
  }, []);

  /**
   * Get the currently stored click count.
   */
  const getVideoClicks =
    useCallback((): number => {
      return (
        readStoredNumber(
          getClickStorageKey(
            content.slug,
          ),
        ) ?? 0
      );
    }, [content.slug]);

  /**
   * Get or create this video's Smart Link threshold.
   *
   * Random modes are selected once per video,
   * rather than changing on every click.
   */
  const getVideoThreshold =
    useCallback(
      (
        settings: SmartLinkSettings,
      ): number => {
        const key =
          getThresholdStorageKey(
            content.slug,
          );

        const stored =
          readStoredNumber(key);

        if (
          stored !== null &&
          stored >= 1 &&
          stored <= 20
        ) {
          return stored;
        }

        const threshold =
          getThresholdForMode(
            settings,
          );

        saveStoredNumber(
          key,
          threshold,
        );

        return threshold;
      },
      [content.slug],
    );

  /**
   * Open Smart Link directly from the user click.
   *
   * This is intentionally synchronous so the browser
   * can treat it as a user-initiated popup.
   */
  const openSmartLink =
    useCallback(
      (
        url: string,
      ): boolean => {
        if (
          !isValidSmartLinkUrl(
            url,
          )
        ) {
          return false;
        }

        try {
          const popup =
            window.open(
              url,
              "_blank",
              "noopener,noreferrer",
            );

          return (
            popup !== null
          );
        } catch {
          return false;
        }
      },
      [],
    );

  /**
   * Handle the main video click.
   *
   * Example with Fixed = 3:
   *
   * Click 1 -> Smart Link
   * Click 2 -> Smart Link
   * Click 3 -> Smart Link
   * Click 4 -> Video
   *
   * Every video has its own counter.
   */
  const handleVideoClick =
    useCallback(
      (
        event: React.MouseEvent<HTMLAnchorElement>,
      ) => {
        /**
         * If Smart Link is disabled or invalid,
         * normal video navigation continues.
         */
        if (
          !smartLinkSettings.enabled ||
          !isValidSmartLinkUrl(
            smartLinkSettings.url,
          )
        ) {
          return;
        }

        const currentCount =
          getVideoClicks();

        const threshold =
          getVideoThreshold(
            smartLinkSettings,
          );

        /**
         * Smart Link phase.
         */
        if (
          currentCount <
          threshold
        ) {
          /**
           * Prevent normal video navigation.
           */
          event.preventDefault();

          const nextCount =
            currentCount + 1;

          saveStoredNumber(
            getClickStorageKey(
              content.slug,
            ),
            nextCount,
          );

          /**
           * Open the Admin configured
           * Smart Link immediately.
           */
          const opened =
            openSmartLink(
              smartLinkSettings.url,
            );

          /**
           * If the browser blocks the popup,
           * do not trap the visitor on the page
           * forever.
           *
           * The counter remains recorded so the
           * next click continues the configured cycle.
           */
          if (!opened) {
            console.warn(
              "[Smart Link] Browser blocked the Smart Link popup.",
            );
          }

          return;
        }

        /**
         * Threshold has been reached.
         *
         * This click is allowed to open the
         * actual video normally.
         */
        removeStoredValue(
          getClickStorageKey(
            content.slug,
          ),
        );

        removeStoredValue(
          getThresholdStorageKey(
            content.slug,
          ),
        );
      },
      [
        smartLinkSettings,
        getVideoClicks,
        getVideoThreshold,
        openSmartLink,
        content.slug,
      ],
    );

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
         * Smart Link handling happens before
         * normal navigation.
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
        >
          <span className="sr-only">
            Watch {content.title}
          </span>
        </Link>

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