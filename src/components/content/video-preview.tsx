"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils/cn";
import { placeholderGradient } from "@/lib/media/placeholder";

export type VideoPreviewProps = {
  poster: string | null;
  previewUrl: string | null;
  alt?: string;
  seed: string;
  sizes: string;
  priority?: boolean;
  className?: string;
};

export function VideoPreview({
  poster,
  previewUrl,
  alt = "",
  seed,
  priority = false,
  className,
}: VideoPreviewProps) {
  const videoRef =
    useRef<HTMLVideoElement>(null);

  const [videoReady, setVideoReady] =
    useState(false);

  const [videoFailed, setVideoFailed] =
    useState(false);

  const [isHovering, setIsHovering] =
    useState(false);

  const hasVideo =
    Boolean(previewUrl) &&
    !videoFailed;

  /*
   * Load the preview video when the URL
   * becomes available.
   */
  useEffect(() => {
    const video =
      videoRef.current;

    if (
      !video ||
      !previewUrl
    ) {
      return;
    }

    setVideoReady(false);
    setVideoFailed(false);

    /*
     * Force the browser to load the new
     * preview source.
     */
    video.load();
  }, [previewUrl]);

  /*
   * Play as soon as the browser has enough
   * data and the mouse is still over the card.
   */
  const playPreview = () => {
    const video =
      videoRef.current;

    if (
      !video ||
      !previewUrl ||
      videoFailed
    ) {
      return;
    }

    /*
     * Always start from the beginning when
     * a new hover starts.
     */
    try {
      video.currentTime = 0;
    } catch {
      // Ignore seek errors.
    }

    /*
     * If the video is already ready, start
     * immediately.
     */
    void video.play().catch(() => {
      /*
       * If play is rejected because the
       * video is still loading, onCanPlay
       * will try again.
       */
    });
  };

  const stopPreview = () => {
    const video =
      videoRef.current;

    setIsHovering(false);

    if (!video) {
      return;
    }

    video.pause();

    /*
     * Reset only after leaving the card.
     * This means the preview never jumps to
     * 0 while the mouse remains inside.
     */
    try {
      video.currentTime = 0;
    } catch {
      // Ignore seek errors.
    }
  };

  const handleMouseEnter = () => {
    setIsHovering(true);

    playPreview();
  };

  const handleCanPlay = () => {
    setVideoReady(true);

    /*
     * If the mouse is still over the card
     * when the video becomes playable,
     * start immediately.
     */
    if (
      isHovering &&
      videoRef.current
    ) {
      void videoRef.current
        .play()
        .catch(() => {
          // Ignore autoplay failures.
        });
    }
  };

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden bg-[#111118]",
        className,
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={stopPreview}
    >
      {/*
       * Poster/fallback remains visible until
       * preview playback actually becomes ready.
       */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-200",
          hasVideo &&
            videoReady &&
            isHovering
            ? "opacity-0"
            : "opacity-100",
        )}
        style={{
          background: poster
            ? undefined
            : placeholderGradient(
                seed,
              ),
        }}
      >
        {poster ? (
          <img
            src={poster}
            alt={alt}
            loading={
              priority
                ? "eager"
                : "lazy"
            }
            className="
              absolute
              inset-0
              size-full
              object-cover
            "
          />
        ) : null}
      </div>

      {hasVideo ? (
        <video
          ref={videoRef}
          src={
            previewUrl ??
            undefined
          }
          muted
          playsInline
          loop
          preload="auto"
          aria-hidden="true"
          onLoadedData={() => {
            setVideoReady(true);

            if (
              isHovering &&
              videoRef.current
            ) {
              void videoRef.current
                .play()
                .catch(() => {
                  // Ignore autoplay failures.
                });
            }
          }}
          onCanPlay={handleCanPlay}
          onError={() => {
            setVideoFailed(true);
            setVideoReady(false);
          }}
          className="
            pointer-events-none
            absolute
            inset-0
            size-full
            object-cover
            transition-transform
            duration-300
            ease-out
            group-hover:scale-[1.03]
            motion-reduce:group-hover:scale-100
          "
        />
      ) : null}

      <div
        className="
          pointer-events-none
          absolute
          inset-0
          bg-gradient-to-t
          from-black/70
          via-black/5
          to-transparent
        "
      />
    </div>
  );
}