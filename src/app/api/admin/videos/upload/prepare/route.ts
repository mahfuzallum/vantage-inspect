import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/auth/guards";
import { serverEnv } from "@/lib/env";
import {
  handleRouteError,
  ok,
  rateLimitedResponse,
} from "@/lib/api/response";
import { ApiError } from "@/lib/api/errors";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";
import {
  maxUploadBytes,
  validateUpload,
} from "@/server/video/upload-validation";
import { getConfiguredMediaProvider } from "@/server/services/storage-service";
import { storagePaths } from "@/lib/media/paths";
import { uniqueSlug, slugify } from "@/lib/utils/slug";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_EXTENSIONS = new Set([
  "mp4",
  "ts",
  "mov",
  "webm",
  "mkv",
  "m4v",
]);

function decodeHead(value: unknown): Buffer {
  if (typeof value !== "string" || !value) {
    throw new ApiError(
      "BAD_REQUEST",
      "Video header data was not provided.",
    );
  }

  try {
    const normalized = value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const padded = normalized.padEnd(
      Math.ceil(normalized.length / 4) * 4,
      "=",
    );

    const head = Buffer.from(padded, "base64");

    if (head.length === 0) {
      throw new Error("empty");
    }

    return head.subarray(0, 4096);
  } catch {
    throw new ApiError(
      "BAD_REQUEST",
      "Video header data is invalid.",
    );
  }
}

function parseBody(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new ApiError(
      "BAD_REQUEST",
      "Upload data is invalid.",
    );
  }

  const data = value as Record<string, unknown>;

  const filename = String(
    data.filename ?? "",
  ).trim();

  const mimeType = String(
    data.mimeType ?? "",
  ).trim();

  const sizeBytes = Number(
    data.sizeBytes ?? 0,
  );

  const title = String(
    data.title ?? "",
  ).trim();

  const creatorId =
    String(data.creatorId ?? "") || null;

  const categoryId =
    String(data.categoryId ?? "") || null;

  const publish = data.publish === true;

  const summary =
    String(data.summary ?? "").trim() || null;

  const tagIds = Array.isArray(data.tagIds)
    ? data.tagIds
        .map(String)
        .filter((id) =>
          /^[a-z0-9]{20,32}$/i.test(id),
        )
        .slice(0, 20)
    : [];

  if (!filename) {
    throw new ApiError(
      "BAD_REQUEST",
      "The uploaded video has no filename.",
    );
  }

  if (
    !Number.isFinite(sizeBytes) ||
    sizeBytes <= 0
  ) {
    throw new ApiError(
      "BAD_REQUEST",
      "The uploaded video size is invalid.",
    );
  }

  if (sizeBytes > maxUploadBytes()) {
    throw new ApiError(
      "BAD_REQUEST",
      `That file exceeds the ${serverEnv().MAX_VIDEO_UPLOAD_MB}MB limit.`,
    );
  }

  if (title.length < 3) {
    throw new ApiError(
      "BAD_REQUEST",
      "Enter a title of at least 3 characters.",
    );
  }

  return {
    filename,
    mimeType,
    sizeBytes,
    title,
    creatorId,
    categoryId,
    publish,
    summary,
    tagIds,
    head: decodeHead(data.headBase64),
  };
}

export async function POST(
  request: NextRequest,
) {
  try {
    await requireApiRole(
      "ADMIN",
      "MODERATOR",
    );

    const limit = await rateLimit(
      "api",
      clientIdentifier(request.headers),
    );

    if (!limit.allowed) {
      return rateLimitedResponse(
        limit.resetAt,
      );
    }

    const body = parseBody(
      await request.json(),
    );

    const provider =
      await getConfiguredMediaProvider();

    if (provider.id !== "S3") {
      if (provider.id === "LOCAL" && !provider.createUploadAuthorization) return ok({ mode: "proxy" as const });
      throw new ApiError("BAD_REQUEST", "Direct video storage is not configured. Configure an S3-compatible storage provider for large video uploads.");
    }

    if (!provider.createUploadAuthorization || !provider.createMultipartUploadAuthorization) {
      throw new ApiError("BAD_REQUEST", "S3 storage does not support direct multipart video uploads.");
    }

    const check = validateUpload({
      filename: body.filename,
      sizeBytes: body.sizeBytes,
      declaredMime: body.mimeType,
      head: body.head,
    });

    if (
      !check.ok ||
      !ALLOWED_EXTENSIONS.has(check.extension)
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        check.ok
          ? "Unsupported video type."
          : check.reason,
      );
    }

    const slug = await uniqueSlug(
      slugify(body.title),
      async (candidate) =>
        Boolean(
          await db.content.findUnique({
            where: {
              slug: candidate,
            },
            select: {
              id: true,
            },
          }),
        ),
    );

    const tagIds =
      body.tagIds.length > 0
        ? (
            await db.tag.findMany({
              where: {
                id: {
                  in: body.tagIds,
                },
              },
              select: {
                id: true,
              },
            })
          ).map((tag) => tag.id)
        : [];

    const content =
      await db.content.create({
        data: {
          slug,
          title: body.title,
          summary: body.summary,
          kind: "VIDEO",

          status: body.publish
            ? "PUBLISHED"
            : "DRAFT",

          publishedAt: body.publish
            ? new Date()
            : null,

          category: body.categoryId
            ? {
                connect: {
                  id: body.categoryId,
                },
              }
            : undefined,

          creator: body.creatorId
            ? {
                connect: {
                  id: body.creatorId,
                },
              }
            : undefined,

          processingStatus: "UPLOADING",

          ...(tagIds.length > 0
            ? {
                tags: {
                  create: tagIds.map(
                    (tagId) => ({
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

    try {
      const objectKey =
        storagePaths.source(
          content.id,
          check.extension,
        );

      /*
       * Large uploads use multipart authorization
       * when the configured provider supports it.
       *
       * 64 MiB parts keep the number of multipart
       * parts reasonable while supporting large files.
       */
      {
        const authorization =
          await provider.createMultipartUploadAuthorization(
            {
              objectKey,
              mimeType: check.detectedMime,
              sizeBytes: body.sizeBytes,
              partSizeBytes:
                64 * 1024 * 1024,
            },
          );

        if (!authorization) {
          throw new ApiError(
            "BAD_REQUEST",
            "The storage provider could not create a multipart upload.",
          );
        }

        return ok(
          {
            mode: "direct" as const,
            uploadType: "multipart" as const,
            contentId: content.id,
            slug: content.slug,
            objectKey,
            authorization,
          },
          {
            status: 201,
          },
        );
      }

      throw new ApiError("BAD_REQUEST", "Multipart upload authorization was not available.");
    } catch (error) {
      await db.content
        .delete({
          where: {
            id: content.id,
          },
        })
        .catch(() => undefined);

      throw error;
    }
  } catch (error) {
    return handleRouteError(error);
  }
}