"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageOff } from "lucide-react";
import { placeholderGradient } from "@/lib/media/placeholder";
import { cn } from "@/lib/utils/cn";

export type ThumbnailProps = {
  src: string | null;
  /** Empty string for decorative images whose card already has a text label. */
  alt: string;
  /** Seeds the fallback gradient so a missing image is stable, not random. */
  seed: string;
  sizes: string;
  priority?: boolean;
  className?: string;
};

/**
 * Image with a graceful failure path. A broken or missing source resolves to
 * the seeded gradient plus a small marker rather than a torn-image icon or an
 * empty box, so a grid with a few dead assets still reads as a grid.
 */
export function Thumbnail({ src, alt, seed, sizes, priority, className }: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  return (
    <span
      className={cn("absolute inset-0 block", className)}
      style={showFallback ? { background: placeholderGradient(seed) } : undefined}
    >
      {showFallback ? (
        <span className="flex size-full items-center justify-center">
          <ImageOff className="size-6 text-ink-faint" aria-hidden="true" />
          {alt ? <span className="sr-only">Preview image unavailable</span> : null}
        </span>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          onError={() => setFailed(true)}
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      )}
    </span>
  );
}
