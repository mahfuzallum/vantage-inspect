import "server-only";

import { stat, createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { isPublicKey } from "@/lib/media/paths";

/**
 * Serves locally stored media files.
 *
 * Storage root:
 *   MEDIA_LOCAL_ROOT
 *
 * Example:
 *   ./storage/uploads
 *
 * URL:
 *   /media/videos/thumbnails/<id>/thumbnail.webp
 *   /media/videos/hls/<id>/master.m3u8
 *   /media/videos/original/<id>/source.ts
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
  return GET(
    request,
    context,
  );
}