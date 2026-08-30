import type { NextRequest } from "next/server";

import {
  mkdir,
  writeFile,
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
 * Upload processing remains asynchronous.
 */
export async function POST(
  request: NextRequest,
) {
  let tempPath: string | null = null;

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
     * Check declared request size before
     * reading the complete multipart body.
     */
    const declaredLength =
      Number(
        request.headers.get(
          "content-length",
        ) ?? 0,
      );

    if (
      declaredLength >
      maxUploadBytes() * 1.05
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        `That file exceeds the ${serverEnv().MAX_VIDEO_UPLOAD_MB}MB limit.`,
      );
    }

    /*
     * Read multipart/form-data.
     *
     * The browser must create the multipart
     * boundary automatically.
     */
    const form =
      await request.formData();

    const file =
      form.get("file");

    const title =
      String(
        form.get("title") ?? "",
      ).trim();

    const shouldPublish =
      String(
        form.get("publish") ?? "",
      ).toLowerCase() === "true";

    if (
      !(file instanceof File)
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        "No video file was received.",
      );
    }

    if (
      title.length < 3
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        "Enter a title of at least 3 characters.",
      );
    }

    /*
     * Read uploaded bytes.
     */
    const bytes =
      Buffer.from(
        await file.arrayBuffer(),
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
          file.name,

        sizeBytes:
          bytes.byteLength,

        declaredMime:
          file.type,

        head:
          bytes.subarray(
            0,
            4096,
          ),
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
        slugify(title),
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
     * Optional creator.
     */
    const creatorId =
      String(
        form.get(
          "creatorId",
        ) ?? "",
      ) || null;

    /*
     * Optional category.
     */
    const categoryId =
      String(
        form.get(
          "categoryId",
        ) ?? "",
      ) || null;

    /*
     * Requested tags.
     */
    const requestedTagIds =
      form
        .getAll("tagIds")
        .map(String)
        .filter(
          (id) =>
            /^[a-z0-9]{20,32}$/i.test(
              id,
            ),
        )
        .slice(
          0,
          20,
        );

    const tagIds =
      requestedTagIds.length > 0
        ? (
            await db.tag.findMany(
              {
                where: {
                  id: {
                    in:
                      requestedTagIds,
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

          title,

          summary:
            String(
              form.get(
                "summary",
              ) ?? "",
            ).trim() || null,

          description:
            String(
              form.get(
                "description",
              ) ?? "",
            ).trim() || null,

          kind:
            "VIDEO",

          status:
            shouldPublish
              ? "PUBLISHED"
              : "DRAFT",

          publishedAt:
            shouldPublish
              ? new Date()
              : null,

          isFeatured:
            form.get(
              "isFeatured",
            ) === "true",

          category:
            categoryId
              ? {
                  connect: {
                    id:
                      categoryId,
                  },
                }
              : undefined,

          creator:
            creatorId
              ? {
                  connect: {
                    id:
                      creatorId,
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
     *
     * The original uploaded filename is
     * never used as a filesystem path.
     *
     * `.ts` is now supported here too.
     */
    const objectKey =
      storagePaths.source(
        content.id,
        check.extension,
      );

    /*
     * IMPORTANT:
     *
     * Local provider storage must live OUTSIDE
     * the Next.js `public` directory.
     *
     * Example:
     *
     * MEDIA_LOCAL_ROOT="./storage/uploads"
     */
    tempPath =
      path.join(
        serverEnv()
          .MEDIA_LOCAL_ROOT,
        objectKey,
      );

    await mkdir(
      path.dirname(
        tempPath,
      ),
      {
        recursive:
          true,
      },
    );

    await writeFile(
      tempPath,
      bytes,
    );

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
            bytes.byteLength,

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
      `[upload] completed content=${content.id} status=${content.status} publish=${shouldPublish} extension=${check.extension} mime=${check.detectedMime} bytes=${bytes.byteLength} by=${admin.id}`,
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
          shouldPublish,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    /*
     * Remove local source if something failed
     * after the file was written.
     */
    if (tempPath) {
      await unlink(
        tempPath,
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