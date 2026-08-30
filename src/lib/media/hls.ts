/**
 * Resolves the public URL for a media object.
 *
 * LOCAL:
 *   Always uses the Next.js /media/[...key] route.
 *
 * S3/R2/etc:
 *   Uses STORAGE_PUBLIC_URL or MEDIA_PUBLIC_BASE_URL.
 *
 * Keeping LOCAL separate is important because local files are served by
 * the application's media route, not by /public/uploads.
 */
export function publicMediaUrl(
  objectKey: string | null | undefined,
): string | null {
  if (!objectKey) {
    return null;
  }

  const cleanKey = objectKey.replace(/^\/+/, "");

  /*
   * Local media is always served through the
   * /media/[...key] route.
   */
  if (
    !process.env.STORAGE_PUBLIC_URL &&
    (
      !process.env.MEDIA_PROVIDER ||
      process.env.MEDIA_PROVIDER.toLowerCase() === "local"
    )
  ) {
    return `/media/${cleanKey}`;
  }

  /*
   * S3/R2/CDN public origin.
   */
  const configured =
    process.env.STORAGE_PUBLIC_URL ||
    process.env.MEDIA_PUBLIC_BASE_URL;

  if (!configured) {
    return `/media/${cleanKey}`;
  }

  return `${configured.replace(/\/$/, "")}/${cleanKey}`;
}

/**
 * True when the browser can play HLS without a JavaScript library.
 */
export function hasNativeHlsSupport(
  video: HTMLVideoElement,
): boolean {
  return (
    video.canPlayType(
      "application/vnd.apple.mpegurl",
    ) !== "" ||
    video.canPlayType(
      "application/x-mpegURL",
    ) !== ""
  );
}

export const HLS_MIME =
  "application/vnd.apple.mpegurl";