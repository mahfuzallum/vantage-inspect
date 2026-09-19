import type { NextRequest } from "next/server";

import { requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { storagePaths } from "@/lib/media/paths";

import {
  handleRouteError,
  ok,
  rateLimitedResponse,
} from "@/lib/api/response";

import {
  clientIdentifier,
  rateLimit,
} from "@/lib/security/rate-limit";

import { getConfiguredMediaProvider } from "@/server/services/storage-service";

export const runtime = "nodejs";

type CompletePart = {
  partNumber: number;
  etag: string;
};

type CompleteMultipartBody = {
  contentId?: string;
  objectKey?: string;
  uploadId?: string;
  parts?: CompletePart[];
};

type MultipartCapableProvider = {
  completeMultipartUpload: (params: {
    objectKey: string;
    uploadId: string;
    parts: CompletePart[];
  }) => Promise<unknown>;
};

export async function POST(
  request: NextRequest,
) {
  try {
    /*
     * Only authenticated administrators
     * and moderators can complete uploads.
     */
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
     * Parse request body.
     */
    let body: CompleteMultipartBody;

    try {
      body =
        (await request.json()) as CompleteMultipartBody;
    } catch {
      return Response.json(
        {
          error: {
            message:
              "The multipart completion request was invalid.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const contentId =
      typeof body.contentId === "string"
        ? body.contentId.trim()
        : "";

    const objectKey =
      typeof body.objectKey === "string"
        ? body.objectKey.trim()
        : "";

    const uploadId =
      typeof body.uploadId === "string"
        ? body.uploadId.trim()
        : "";

    /*
     * Validate required fields.
     */
    if (
      !contentId ||
      !objectKey ||
      !uploadId
    ) {
      return Response.json(
        {
          error: {
            message:
              "The multipart upload completion data was incomplete.",
          },
        },
        {
          status: 400,
        },
      );
    }

    const content = await db.content.findUnique({
      where: { id: contentId },
      select: { id: true, kind: true },
    });

    if (!content || content.kind !== "VIDEO") {
      return Response.json({ error: { message: "Video content was not found." } }, { status: 400 });
    }

    const validPrefix = `videos/original/${content.id}/source.`;
    if (!objectKey.startsWith(validPrefix)) {
      return Response.json({ error: { message: "Invalid video storage key." } }, { status: 400 });
    }

    // ETags are optional. S3/R2 will be queried server-side when the browser
    // cannot expose them because of CORS.
    const parts: CompletePart[] = [];

    for (const part of Array.isArray(body.parts) ? body.parts : []) {
      if (
        !part ||
        !Number.isInteger(
          part.partNumber,
        ) ||
        part.partNumber < 1 ||
        typeof part.etag !== "string" ||
        !part.etag.trim()
      ) {
        return Response.json(
          {
            error: {
              message:
                "One or more multipart parts were invalid.",
            },
          },
          {
            status: 400,
          },
        );
      }

      parts.push({
        partNumber:
          part.partNumber,
        etag: part.etag.trim(),
      });
    }

    /* Sort and validate supplied parts. If none were supplied, the provider
       will obtain the authoritative list from S3/R2. */
    parts.sort((a, b) => a.partNumber - b.partNumber);

    for (
      let index = 0;
      index < parts.length;
      index += 1
    ) {
      const part =
        parts[index];

      if (
        !part ||
        part.partNumber !==
          index + 1
      ) {
        return Response.json(
          {
            error: {
              message:
                "Multipart parts must be consecutive and start at part 1.",
            },
          },
          {
            status: 400,
          },
        );
      }
    }

    /*
     * Get configured storage provider.
     */
    const provider =
      await getConfiguredMediaProvider();

    /*
     * The multipart method is implemented
     * by the S3/R2 storage provider.
     */
    const multipartProvider =
      provider as unknown as MultipartCapableProvider;

    if (
      typeof multipartProvider.completeMultipartUpload !==
      "function"
    ) {
      return Response.json(
        {
          error: {
            message:
              "The configured storage provider does not support multipart uploads.",
          },
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Complete the multipart upload
     * at R2/S3.
     */
    await multipartProvider.completeMultipartUpload(
      {
        objectKey,
        uploadId,
        parts,
      },
    );

    /*
     * The frontend expects contentId
     * before continuing to finalize.
     */
    return ok({
      contentId,
      objectKey,
    });
  } catch (error) {
    return handleRouteError(
      error,
    );
  }
}