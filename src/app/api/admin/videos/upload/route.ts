import type { NextRequest } from "next/server";

import {
  createWriteStream,
} from "node:fs";

import {
  mkdir,
  rename,
  unlink,
} from "node:fs/promises";

import path from "node:path";

import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/auth/guards";
import { serverEnv } from "@/lib/env";

import {
  handleRouteError,
  ok,
  rateLimitedResponse,
} from "@/lib/api/response";

import { ApiError } from "@/lib/api/errors";

import {
  clientIdentifier,
  rateLimit,
} from "@/lib/security/rate-limit";

import {
  maxUploadBytes,
  validateUpload,
} from "@/server/video/upload-validation";

import {
  enqueueVideoProcessing,
} from "@/server/video/queue";

import {
  storagePaths,
} from "@/lib/media/paths";

import {
  uniqueSlug,
  slugify,
} from "@/lib/utils/slug";

/**
 * Large video bodies must use the Node.js runtime.
 */
export const runtime = "nodejs";

export const maxDuration = 300;

/**
 * Decode the metadata header sent by the browser.
 *
 * The video itself is sent as the raw request body.
 * Metadata is sent separately so Next.js does not need
 * to parse the entire multipart request into memory.
 */
function decodeMetadata(
  value: string | null,
): {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  title: string;
  creatorId: string | null;
  categoryId: string | null;
  publish: boolean;
  summary: string | null;
  description: string | null;
  isFeatured: boolean;
  tagIds: string[];
} {
  if (!value) {
    throw new ApiError(
      "BAD_REQUEST",
      "Upload metadata was not provided.",
    );
  }

  try {
    const normalized =
      value
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const padded =
      normalized.padEnd(
        Math.ceil(normalized.length / 4) * 4,
        "=",
      );

    const json =
      Buffer.from(
        padded,
        "base64",
      ).toString("utf8");

    const data =
      JSON.parse(json) as Record<
        string,
        unknown
      >;

    const filename =
      String(
        data.filename ?? "",
      ).trim();

    const mimeType =
      String(
        data.mimeType ?? "",
      ).trim();

    const sizeBytes =
      Number(
        data.sizeBytes ?? 0,
      );

    const title =
      String(
        data.title ?? "",
      ).trim();

    if (!filename) {
      throw new ApiError(
        "BAD_REQUEST",
        "The uploaded video has no filename.",
      );
    }

    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new ApiError(
        "BAD_REQUEST",
        "The uploaded video size is invalid.",
      );
    }

    if (title.length < 3) {
      throw new ApiError(
        "BAD_REQUEST",
        "Enter a title of at least 3 characters.",
      );
    }

    const rawTagIds =
      Array.isArray(data.tagIds)
        ? data.tagIds
        : [];

    const tagIds =
      rawTagIds
        .map(String)
        .filter(
          (id) =>
            /^[a-z0-9]{20,32}$/i.test(
              id,
            ),
        )
        .slice(0, 20);

    return {
      filename,

      mimeType,

      sizeBytes,

      title,

      creatorId:
        String(
          data.creatorId ?? "",
        ) || null,

      categoryId:
        String(
          data.categoryId ?? "",
        ) || null,

      publish:
        data.publish === true,

      summary:
        String(
          data.summary ?? "",
        ).trim() || null,

      description:
        String(
          data.description ?? "",
        ).trim() || null,

      isFeatured:
        data.isFeatured === true,

      tagIds,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      "BAD_REQUEST",
      "The upload metadata is invalid.",
    );
  }
}

/**
 * Write one Web Stream chunk to a Node write stream
 * while respecting backpressure.
 */
async function writeChunk(
  stream: ReturnType<typeof createWriteStream>,
  chunk: Uint8Array,
) {
  if (
    stream.write(chunk)
  ) {
    return;
  }

  await new Promise<void>(
    (
      resolve,
      reject,
    ) => {
      const onDrain =
        () => {
          cleanup();
          resolve();
        };

      const onError =
        (
          error: Error,
        ) => {
          cleanup();
          reject(error);
        };

      const cleanup =
        () => {
          stream.off(
            "drain",
            onDrain,
          );

          stream.off(
            "error",
            onError,
          );
        };

      stream.once(
        "drain",
        onDrain,
      );

      stream.once(
        "error",
        onError,
      );
    },
  );
}

/**
 * Stream the request body directly to disk.
 *
 * Only the first 4096 bytes are kept in memory for
 * container validation.
 */
async function streamUploadToDisk(
  request: NextRequest,
  tempPath: string,
  expectedSize: number,
) {
  const body =
    request.body;

  if (!body) {
    throw new ApiError(
      "BAD_REQUEST",
      "No video body was received.",
    );
  }

  const reader =
    body.getReader();

  const output =
    createWriteStream(
      tempPath,
      {
        flags: "w",
      },
    );

  let receivedBytes = 0;

  const headChunks: Buffer[] = [];

  try {
    while (true) {
      const result =
        await reader.read();

      if (result.done) {
        break;
      }

      const chunk =
        Buffer.from(
          result.value,
        );

      receivedBytes +=
        chunk.byteLength;

      /*
       * Hard server-side size protection.
       */
      if (
        receivedBytes >
        maxUploadBytes()
      ) {
        throw new ApiError(
          "BAD_REQUEST",
          `That file exceeds the ${serverEnv().MAX_VIDEO_UPLOAD_MB}MB limit.`,
        );
      }

      /*
       * Keep only the first 4096 bytes
       * for container detection.
       */
      if (
        receivedBytes <= 4096
      ) {
        headChunks.push(
          chunk,
        );
      } else if (
        headChunks.length > 0
      ) {
        const currentHead =
          Buffer.concat(
            headChunks,
          );

        if (
          currentHead.length <
          4096
        ) {
          headChunks.push(
            chunk.subarray(
              0,
              4096 -
                currentHead.length,
            ),
          );
        }
      }

      await writeChunk(
        output,
        chunk,
      );
    }

    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        output.end(
          () => resolve(),
        );

        output.once(
          "error",
          reject,
        );
      },
    );

    /*
     * The client-declared size and actual
     * received bytes must match.
     */
    if (
      receivedBytes !==
      expectedSize
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        "The uploaded file was incomplete or corrupted during transfer.",
      );
    }

    return {
      sizeBytes:
        receivedBytes,

      head:
        Buffer.concat(
          headChunks,
        ).subarray(
          0,
          4096,
        ),
    };
  } catch (error) {
    output.destroy();

    await reader.cancel().catch(
      () => undefined,
    );

    throw error;
  }
}

/**
 * Authorized video upload.
 *
 * Supports:
 * - MP4
 * - MPEG-TS (.ts)
 * - MOV
 * - WebM
 * - MKV
 * - M4V
 *
 * The video body is streamed directly to disk.
 */
export async function POST(
  request: NextRequest,
) {
  let tempPath: string | null =
    null;

  let finalPath: string | null =
    null;

  try {
    /*
     * Only authenticated administrators
     * and moderators can upload.
     */
    const admin =
      await requireApiRole(
        "ADMIN",
        "MODERATOR",
      );

    /*
     * Rate limiting.
     */
    const limit =
      await rateLimit(
        "api",
        clientIdentifier(
          request.headers,
        ),
      );

    if (!limit.allowed) {
      return rateLimitedResponse(
        limit.resetAt,
      );
    }

    /*
     * The browser sends the metadata separately
     * from the raw video body.
     */
    const metadata =
      decodeMetadata(
        request.headers.get(
          "x-video-metadata",
        ),
      );

    /*
     * Reject a request that is already larger
     * than the configured limit.
     */
    const declaredLength =
      Number(
        request.headers.get(
          "content-length",
        ) ?? 0,
      );

    if (
      declaredLength > 0 &&
      declaredLength >
        maxUploadBytes()
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        `That file exceeds the ${serverEnv().MAX_VIDEO_UPLOAD_MB}MB limit.`,
      );
    }

    /*
     * The metadata size must also respect
     * the configured upload ceiling.
     */
    if (
      metadata.sizeBytes >
      maxUploadBytes()
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        `That file exceeds the ${serverEnv().MAX_VIDEO_UPLOAD_MB}MB limit.`,
      );
    }

    /*
     * Create a temporary directory outside
     * the final source path.
     */
    const uploadTempRoot =
      path.join(
        serverEnv()
          .MEDIA_LOCAL_ROOT,
        ".upload-temp",
      );

    await mkdir(
      uploadTempRoot,
      {
        recursive: true,
      },
    );

    /*
     * Generate a temporary filename.
     */
    const tempFilename =
      `${Date.now()}-${Math.random().toString(36).slice(2)}.part`;

    tempPath =
      path.join(
        uploadTempRoot,
        tempFilename,
      );

    /*
     * Stream the video directly to disk.
     *
     * This avoids:
     *
     * Buffer.from(await file.arrayBuffer())
     *
     * and therefore avoids loading a 1GB/2GB
     * video completely into RAM.
     */
    const streamed =
      await streamUploadToDisk(
        request,
        tempPath,
        metadata.sizeBytes,
      );

    /*
     * Validate:
     *
     * - extension
     * - size
     * - declared MIME
     * - actual container bytes
     */
    const check =
      validateUpload({
        filename:
          metadata.filename,

        sizeBytes:
          streamed.sizeBytes,

        declaredMime:
          metadata.mimeType,

        head:
          streamed.head,
      });

    if (!check.ok) {
      throw new ApiError(
        "BAD_REQUEST",
        check.reason,
      );
    }

    /*
     * Generate unique SEO slug.
     */
    const slug =
      await uniqueSlug(
        slugify(
          metadata.title,
        ),
        async (
          candidate,
        ) =>
          Boolean(
            await db.content.findUnique(
              {
                where: {
                  slug:
                    candidate,
                },

                select: {
                  id: true,
                },
              },
            ),
          ),
      );

    /*
     * Verify requested tags.
     */
    const tagIds =
      metadata.tagIds.length > 0
        ? (
            await db.tag.findMany(
              {
                where: {
                  id: {
                    in:
                      metadata.tagIds,
                  },
                },

                select: {
                  id: true,
                },
              },
            )
          ).map(
            (tag) =>
              tag.id,
          )
        : [];

    /*
     * Create content record.
     */
    const content =
      await db.content.create({
        data: {
          slug,

          title:
            metadata.title,

          summary:
            metadata.summary,

          description:
            metadata.description,

          kind:
            "VIDEO",

          status:
            metadata.publish
              ? "PUBLISHED"
              : "DRAFT",

          publishedAt:
            metadata.publish
              ? new Date()
              : null,

          isFeatured:
            metadata.isFeatured,

          category:
            metadata.categoryId
              ? {
                  connect: {
                    id:
                      metadata.categoryId,
                  },
                }
              : undefined,

          creator:
            metadata.creatorId
              ? {
                  connect: {
                    id:
                      metadata.creatorId,
                  },
                }
              : undefined,

          processingStatus:
            "UPLOADING",

          ...(tagIds.length > 0
            ? {
                tags: {
                  create:
                    tagIds.map(
                      (
                        tagId,
                      ) => ({
                        tagId,
                      }),
                    ),
                },
              }
            : {}),
        },

        select: {
          id: true,
          slug: true,
          status: true,
          publishedAt: true,
        },
      });

    /*
     * Generate safe storage key.
     */
    const objectKey =
      storagePaths.source(
        content.id,
        check.extension,
      );

    /*
     * Final local filesystem path.
     */
    finalPath =
      path.join(
        serverEnv()
          .MEDIA_LOCAL_ROOT,
        objectKey,
      );

    await mkdir(
      path.dirname(
        finalPath,
      ),
      {
        recursive: true,
      },
    );

    /*
     * Move the completed temporary upload
     * into its final source location.
     */
    await rename(
      tempPath,
      finalPath,
    );

    tempPath = null;

    /*
     * Create source media asset.
     */
    const asset =
      await db.mediaAsset.create({
        data: {
          kind:
            "VIDEO",

          provider:
            serverEnv()
              .MEDIA_PROVIDER ===
            "s3"
              ? "S3"
              : "LOCAL",

          bucket:
            serverEnv()
              .STORAGE_BUCKET ??
            null,

          objectKey,

          mimeType:
            check.detectedMime,

          sizeBytes:
            streamed.sizeBytes,

          uploadedById:
            admin.id,
        },

        select: {
          id: true,
        },
      });

    /*
     * Attach source to content.
     */
    await db.content.update({
      where: {
        id:
          content.id,
      },

      data: {
        sourceId:
          asset.id,
      },
    });

    /*
     * Queue background FFmpeg processing.
     */
    const jobId =
      await enqueueVideoProcessing(
        content.id,
      );

    console.info(
      `[upload] completed content=${content.id} status=${content.status} publish=${metadata.publish} extension=${check.extension} mime=${check.detectedMime} bytes=${streamed.sizeBytes} by=${admin.id}`,
    );

    return ok(
      {
        contentId:
          content.id,

        slug:
          content.slug,

        jobId,

        status:
          content.status,

        publishedAt:
          content.publishedAt,

        published:
          metadata.publish,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    /*
     * Remove incomplete temporary upload.
     */
    if (tempPath) {
      await unlink(
        tempPath,
      ).catch(
        () => undefined,
      );
    }

    /*
     * Remove final source if a later operation
     * failed after the rename.
     */
    if (finalPath) {
      await unlink(
        finalPath,
      ).catch(
        () => undefined,
      );
    }

    return handleRouteError(
      error,
    );
  }
}

/**
 * Exposes the configured upload limit
 * and supported video extensions.
 */
export async function GET() {
  try {
    await requireApiRole(
      "ADMIN",
      "MODERATOR",
    );

    return ok({
      maxUploadMb:
        serverEnv()
          .MAX_VIDEO_UPLOAD_MB,

      acceptedExtensions: [
        "mp4",
        "ts",
        "mov",
        "webm",
        "mkv",
        "m4v",
      ],
    });
  } catch (error) {
    return handleRouteError(
      error,
    );
  }
}