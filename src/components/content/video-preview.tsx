"use client";

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
  previewUrl: _previewUrl,
  alt = "",
  seed,
  priority = false,
  className,
}: VideoPreviewProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden bg-[#111118]",
        className,
      )}
      style={{
        background: poster
          ? undefined
          : placeholderGradient(seed),
      }}
    >
      {poster ? (
        <img
          src={poster}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent"
      />
    </div>
  );
}