"use client";

import type { MediaKind } from "@prisma/client";
import { MediaPlayer } from "./media-player";
import { useViewTracker } from "./view-tracker";

export type ContentPlayerProps = {
  contentId: string;
  kind: MediaKind;
  src: string | null;
  hlsSrc?: string | null;
  poster: string | null;
  title: string;
};

/**
 * The only client boundary on the detail page. Everything else — metadata,
 * description, related rails — stays server-rendered.
 */
export function ContentPlayer({ contentId, kind, src, hlsSrc, poster, title }: ContentPlayerProps) {
  const trackView = useViewTracker(contentId);

  return (
    <MediaPlayer
      kind={kind}
      src={src}
      hlsSrc={hlsSrc}
      poster={poster}
      title={title}
      onPlaybackStart={trackView}
    />
  );
}
