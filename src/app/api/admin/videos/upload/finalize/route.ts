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
import {
  clientIdentifier,
  rateLimit,
} from "@/lib/security/rate-limit";
import { maxUploadBytes } from "@/server/video/upload-validation";
import { enqueueVideoProcessing } from "@/server/video/queue";
import {
  getConfiguredMediaProvider,
} from "@/server/services/storage-service";
import { storagePaths } from "@/lib/media/paths";
import {
  recordUploadedAsset,
} from "@/server/services/media-service";

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

function parseBody(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new ApiError(
      "BAD_REQUEST",
      "Finalize data is invalid.",
    );
  }

  const data = value as Record<string, unknown>;

  const contentId =
    String(data.contentId ?? "").trim();

  const objectKey =
    String(data.objectKey ?? "").trim();

  const filename =
    String(data.filename ?? "").trim();

  const mimeType =
    String(data.mimeType ?? "").trim();

  const sizeBytes =
    Number(data.sizeBytes ?? 0);

  if (!contentId) {
    throw new ApiError(
      "BAD_REQUEST",
      "Video content ID was not provided.",
    );
  }

  if (!objectKey) {
    throw new ApiError(
      "BAD_REQUEST",
      "Video storage key was not provided.",
    );
  }

  if (!filename) {
    throw new ApiError(
      "BAD_REQUEST",
      "Video filename was not provided.",
    );
  }

  if (
    !Number.isFinite(sizeBytes) ||
    sizeBytes <= 0
  ) {
    throw new ApiError(
      "BAD_REQUEST",
      "Video size is invalid.",
    );
  }

  if (sizeBytes > maxUploadBytes()) {
    throw new ApiError(
      "BAD_REQUEST",
      `That file exceeds the ${serverEnv().MAX_VIDEO_UPLOAD_MB}MB limit.`,
    );
  }

  return {
    contentId,
    objectKey,
    filename,
    mimeType,
    sizeBytes,
  };
}

export async function POST(
  request: NextRequest,
) {
  try {
    const admin =
      await requireApiRole(
        "ADMIN",
        "MODERATOR",
      );

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

    const body =
      parseBody(
        await request.json(),
      );

    const content =
      await db.content.findUnique({
        where: {
          id: body.contentId,
        },
        select: {
          id: true,
          slug: true,
          status: true,
          publishedAt: true,
          kind: true,
          sourceId: true,
        },
      });

    if (!content) {
      throw new ApiError(
        "BAD_REQUEST",
        "Video content was not found.",
      );
    }

    if (content.kind !== "VIDEO") {
      throw new ApiError(
        "BAD_REQUEST",
        "The selected content is not a video.",
      );
    }

    if (content.sourceId) {
      throw new ApiError(
        "BAD_REQUEST",
        "This video has already been finalized.",
      );
    }

    const objectPrefix =
      `videos/original/${content.id}/source.`;

    if (
      !body.objectKey.startsWith(
        objectPrefix,
      )
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        "Invalid video storage key.",
      );
    }

    const extension =
      body.objectKey
        .slice(objectPrefix.length)
        .toLowerCase();

    if (
      !ALLOWED_EXTENSIONS.has(
        extension,
      )
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        "Unsupported video type.",
      );
    }

    const expectedKey =
      storagePaths.source(
        content.id,
        extension,
      );

    if (
      body.objectKey !==
      expectedKey
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        "Invalid video storage key.",
      );
    }

    const provider =
      await getConfiguredMediaProvider();

    if (
      provider.id !== "S3"
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        "Direct video upload requires S3-compatible storage.",
      );
    }

    const metadata =
      await provider.getMetadata({
        provider: provider.id,
        bucket: null,
        objectKey: body.objectKey,
        url: null,
        mimeType:
          body.mimeType || null,
        sizeBytes: null,
      });

    if (!metadata) {
      throw new ApiError(
        "BAD_REQUEST",
        "The uploaded video was not found in storage.",
      );
    }

    if (
      metadata.sizeBytes <= 0
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        "The uploaded video is empty.",
      );
    }

    if (
      metadata.sizeBytes >
      maxUploadBytes()
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        `That file exceeds the ${serverEnv().MAX_VIDEO_UPLOAD_MB}MB limit.`,
      );
    }

    if (
      metadata.sizeBytes !==
      body.sizeBytes
    ) {
      throw new ApiError(
        "BAD_REQUEST",
        "Uploaded video size does not match the selected file.",
      );
    }

    const asset =
      await recordUploadedAsset({
        objectKey:
          body.objectKey,
        kind: "VIDEO",
        mimeType:
          metadata.mimeType ||
          body.mimeType ||
          "application/octet-stream",
        originalName:
          body.filename,
        uploadedById:
          admin.id,
      });

    if (!asset) {
      throw new ApiError(
        "BAD_REQUEST",
        "The uploaded video could not be registered.",
      );
    }

    await db.content.update({
      where: {
        id: content.id,
      },
      data: {
        sourceId: asset.id,
      },
    });

    const jobId =
      await enqueueVideoProcessing(
        content.id,
      );

    console.info(
      `[upload] direct finalize content=${content.id} size=${asset.sizeBytes} key=${body.objectKey} by=${admin.id}`,
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
          content.status ===
          "PUBLISHED",
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return handleRouteError(
      error,
    );
  }
}