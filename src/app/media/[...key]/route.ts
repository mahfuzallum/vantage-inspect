import "server-only";

import { stat, createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { isPublicKey } from "@/lib/media/paths";
import { getConfiguredMediaProvider } from "@/server/services/storage-service";
import type { StoredObject } from "@/lib/media/types";

/**
 * Serves public/derived media.
 *
 * LOCAL:
 *   Reads directly from MEDIA_LOCAL_ROOT.
 *
 * S3 / R2:
 *   Resolves a storage URL and proxies the object through this route.
 *
 * URL:
 *   /media/videos/thumbnails/<id>/thumbnail.webp
 *   /media/videos/hls/<id>/master.m3u8
 *   /media/videos/hls/<id>/720p/playlist.m3u8
 *   /media/videos/hls/<id>/720p/segment.ts
 *
 * Original source files remain protected from public access.
 */

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    key: string[];
  }>;
};

function getContentType(
  objectKey: string,
): string {
  const extension =
    path
      .extname(objectKey)
      .toLowerCase();

  switch (extension) {
    case ".mp4":
      return "video/mp4";

    case ".m4v":
      return "video/x-m4v";

    case ".mov":
      return "video/quicktime";

    case ".ts":
      return "video/mp2t";

    case ".webm":
      return "video/webm";

    case ".mkv":
      return "video/x-matroska";

    case ".m3u8":
      return "application/vnd.apple.mpegurl";

    case ".webp":
      return "image/webp";

    case ".jpg":
    case ".jpeg":
      return "image/jpeg";

    case ".png":
      return "image/png";

    case ".avif":
      return "image/avif";

    case ".gif":
      return "image/gif";

    default:
      return "application/octet-stream";
  }
}

/**
 * Safely resolve an object key inside MEDIA_LOCAL_ROOT.
 */
function resolveMediaPath(
  root: string,
  objectKey: string,
): string {
  const normalizedRoot =
    path.resolve(root);

  const normalizedKey =
    objectKey
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

  const segments =
    normalizedKey.split("/");

  if (
    !normalizedKey ||
    normalizedKey.includes("\0") ||
    segments.includes(".") ||
    segments.includes("..")
  ) {
    throw new Error(
      "Unsafe media path.",
    );
  }

  const absolute =
    path.resolve(
      normalizedRoot,
      normalizedKey,
    );

  const relative =
    path.relative(
      normalizedRoot,
      absolute,
    );

  if (
    relative === ".." ||
    relative.startsWith(
      `..${path.sep}`,
    ) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      "Media path escapes storage root.",
    );
  }

  return absolute;
}

/**
 * Parse a HTTP Range header.
 *
 * Supports:
 *   bytes=0-1023
 *   bytes=1024-
 *   bytes=-1024
 */
function parseRange(
  header: string,
  size: number,
): {
  start: number;
  end: number;
} | null {
  if (!header.startsWith("bytes=")) {
    return null;
  }

  const value =
    header
      .slice("bytes=".length)
      .split(",")[0]
      ?.trim();

  if (!value) {
    return null;
  }

  const [startRaw, endRaw] =
    value.split("-");

  let start: number;
  let end: number;

  if (startRaw === "") {
    const suffixLength =
      Number(endRaw);

    if (
      !Number.isFinite(
        suffixLength,
      ) ||
      suffixLength <= 0
    ) {
      return null;
    }

    start =
      Math.max(
        0,
        size - suffixLength,
      );

    end =
      size - 1;
  } else {
    start =
      Number(startRaw);

    if (
      !Number.isInteger(start) ||
      start < 0
    ) {
      return null;
    }

    if (endRaw === "") {
      end = size - 1;
    } else {
      end =
        Number(endRaw);

      if (
        !Number.isInteger(end) ||
        end < start
      ) {
        return null;
      }

      end =
        Math.min(
          end,
          size - 1,
        );
    }
  }

  if (
    start >= size ||
    end < start
  ) {
    return null;
  }

  return {
    start,
    end,
  };
}

/**
 * Proxy public media through the configured S3/R2 provider.
 *
 * This is important for private R2 buckets because the browser cannot
 * directly access the object without a signed URL.
 */
async function serveS3Media(
  request: NextRequest,
  objectKey: string,
  method: "GET" | "HEAD",
): Promise<NextResponse> {
  const provider =
    await getConfiguredMediaProvider();

  const object: StoredObject = {
    provider: "S3",
    // Use the active provider's configured bucket.
    // This keeps DB-configured S3/R2 profiles and .env from disagreeing.
    bucket: null,
    objectKey,
    url: null,
    mimeType:
      getContentType(
        objectKey,
      ),
    sizeBytes: null,
  };

  const url =
    await provider.resolveUrl(
      object,
      {
        expiresInSeconds: 900,
      },
    );

  if (!url) {
    return new NextResponse(
      "Media not found.",
      {
        status: 404,
      },
    );
  }

  const rangeHeader =
    request.headers.get(
      "range",
    );

  const upstreamHeaders =
    new Headers();

  if (rangeHeader) {
    upstreamHeaders.set(
      "Range",
      rangeHeader,
    );
  }

  const upstream =
    await fetch(
      url,
      {
        method,
        headers:
          upstreamHeaders,
        cache: "no-store",
      },
    );

  if (
    !upstream.ok &&
    upstream.status !== 206
  ) {
    if (
      upstream.status === 404
    ) {
      return new NextResponse(
        "Media not found.",
        {
          status: 404,
        },
      );
    }

    return new NextResponse(
      "Unable to retrieve media.",
      {
        status: 502,
      },
    );
  }

  const headers =
    new Headers();

  const contentType =
    upstream.headers.get(
      "content-type",
    ) ||
    getContentType(
      objectKey,
    );

  headers.set(
    "Content-Type",
    contentType,
  );

  const contentLength =
    upstream.headers.get(
      "content-length",
    );

  if (contentLength) {
    headers.set(
      "Content-Length",
      contentLength,
    );
  }

  const contentRange =
    upstream.headers.get(
      "content-range",
    );

  if (contentRange) {
    headers.set(
      "Content-Range",
      contentRange,
    );
  }

  headers.set(
    "Accept-Ranges",
    "bytes",
  );

  headers.set(
    "Cache-Control",
    "public, max-age=31536000, immutable",
  );

  if (method === "HEAD") {
    return new NextResponse(
      null,
      {
        status:
          upstream.status,
        headers,
      },
    );
  }

  return new NextResponse(
    upstream.body,
    {
      status:
        upstream.status,
      headers,
    },
  );
}

/**
 * GET /media/*
 */
export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { key } =
      await context.params;

    if (
      !Array.isArray(key) ||
      key.length === 0
    ) {
      return new NextResponse(
        "Media key is required.",
        {
          status: 400,
        },
      );
    }

    const objectKey =
      key.join("/");

    /*
     * Only derived/presentational media can
     * be requested publicly.
     *
     * Original uploads remain private.
     */
    if (
      !isPublicKey(objectKey)
    ) {
      return new NextResponse(
        "Media not found.",
        {
          status: 404,
        },
      );
    }

    const env =
      serverEnv();

    /*
     * S3 / Cloudflare R2:
     *
     * Media lives in object storage, so proxy
     * the object through a short-lived signed URL.
     *
     * This also makes every HLS segment work:
     *
     * /media/videos/hls/.../master.m3u8
     * /media/videos/hls/.../720p/playlist.m3u8
     * /media/videos/hls/.../720p/segment.ts
     */
    const configuredProvider =
      await getConfiguredMediaProvider();

    if (
      configuredProvider.id === "S3"
    ) {
      return serveS3Media(
        request,
        objectKey,
        "GET",
      );
    }

    /*
     * LOCAL storage:
     * retain the existing filesystem behaviour.
     */
    const absolutePath =
      resolveMediaPath(
        env.MEDIA_LOCAL_ROOT,
        objectKey,
      );

    let info;

    try {
      info =
        await new Promise<{
          size: number;
          isFile: boolean;
        }>(
          (
            resolve,
            reject,
          ) => {
            stat(
              absolutePath,
              (
                error,
                result,
              ) => {
                if (error) {
                  reject(error);
                  return;
                }

                resolve({
                  size:
                    result.size,

                  isFile:
                    result.isFile(),
                });
              },
            );
          },
        );
    } catch {
      return new NextResponse(
        "Media not found.",
        {
          status: 404,
        },
      );
    }

    if (!info.isFile) {
      return new NextResponse(
        "Media not found.",
        {
          status: 404,
        },
      );
    }

    if (info.size <= 0) {
      return new NextResponse(
        null,
        {
          status: 204,
        },
      );
    }

    const contentType =
      getContentType(
        objectKey,
      );

    const rangeHeader =
      request.headers.get(
        "range",
      );

    /*
     * HEAD is useful for browser/media
     * metadata checks without downloading bytes.
     */
    if (
      request.method === "HEAD"
    ) {
      return new NextResponse(
        null,
        {
          status: 200,

          headers: {
            "Content-Type":
              contentType,

            "Content-Length":
              String(info.size),

            "Accept-Ranges":
              "bytes",

            "Cache-Control":
              "public, max-age=31536000, immutable",
          },
        },
      );
    }

    /*
     * No Range:
     * return the complete file.
     */
    if (!rangeHeader) {
      const stream =
        createReadStream(
          absolutePath,
        );

      const body =
        Readable.toWeb(
          stream,
        ) as ReadableStream;

      return new NextResponse(
        body,
        {
          status: 200,

          headers: {
            "Content-Type":
              contentType,

            "Content-Length":
              String(info.size),

            "Accept-Ranges":
              "bytes",

            "Cache-Control":
              "public, max-age=31536000, immutable",
          },
        },
      );
    }

    /*
     * Video players normally use Range
     * requests for seeking and playback.
     */
    const range =
      parseRange(
        rangeHeader,
        info.size,
      );

    if (!range) {
      return new NextResponse(
        null,
        {
          status: 416,

          headers: {
            "Content-Range":
              `bytes */${info.size}`,

            "Accept-Ranges":
              "bytes",
          },
        },
      );
    }

    const contentLength =
      range.end -
      range.start +
      1;

    const stream =
      createReadStream(
        absolutePath,
        {
          start:
            range.start,

          end:
            range.end,
        },
      );

    const body =
      Readable.toWeb(
        stream,
      ) as ReadableStream;

    return new NextResponse(
      body,
      {
        status: 206,

        headers: {
          "Content-Type":
            contentType,

          "Content-Length":
            String(contentLength),

          "Content-Range":
            `bytes ${range.start}-${range.end}/${info.size}`,

          "Accept-Ranges":
            "bytes",

          "Cache-Control":
            "public, max-age=31536000, immutable",
        },
      },
    );
  } catch (error) {
    console.error(
      "[media] failed to serve media:",
      error,
    );

    return new NextResponse(
      "Unable to serve media.",
      {
        status: 500,
      },
    );
  }
}

/**
 * HEAD /media/*
 */
export async function HEAD(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { key } =
      await context.params;

    if (
      !Array.isArray(key) ||
      key.length === 0
    ) {
      return new NextResponse(
        "Media key is required.",
        {
          status: 400,
        },
      );
    }

    const objectKey =
      key.join("/");

    if (
      !isPublicKey(objectKey)
    ) {
      return new NextResponse(
        "Media not found.",
        {
          status: 404,
        },
      );
    }

    const configuredProvider =
      await getConfiguredMediaProvider();

    if (
      configuredProvider.id === "S3"
    ) {
      return serveS3Media(
        request,
        objectKey,
        "HEAD",
      );
    }

    return GET(
      request,
      context,
    );
  } catch (error) {
    console.error(
      "[media] failed to serve HEAD media:",
      error,
    );

    return new NextResponse(
      "Unable to serve media.",
      {
        status: 500,
      },
    );
  }
}