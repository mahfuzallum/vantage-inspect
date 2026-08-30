import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth/guards";
import { handleRouteError, ok, rateLimitedResponse } from "@/lib/api/response";
import { ApiError } from "@/lib/api/errors";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";
import { authorizeDirectUpload, type AssetTarget } from "@/server/services/media-service";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
} from "@/lib/media/image-validation";
import {
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_VIDEO_MIME_TYPES,
  maxUploadBytes,
} from "@/server/video/upload-validation";
import { cuidSchema } from "@/validation/common";

export const runtime = "nodejs";

/**
 * Step 1 of a direct upload: ask for authorization.
 *
 * The server decides the object key and validates the declared type and size
 * *before* signing anything. The signature it returns is scoped to that one
 * key and content type, so the browser cannot redirect the upload elsewhere or
 * change what it is uploading afterwards.
 *
 * When the configured backend cannot sign uploads (local disk in development)
 * this reports `mode: "proxy"` and the client posts through the application
 * instead. It never pretends a direct upload is available when it is not.
 */
const bodySchema = z.object({
  scope: z.enum(["contentThumbnail", "contentVideo", "creatorAvatar", "creatorBanner", "site"]),
  entityId: z.string().max(64).optional(),
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(3).max(120),
  sizeBytes: z.coerce.number().int().positive(),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requireApiRole("ADMIN", "MODERATOR");

    const limit = await rateLimit("uploadAuthorize", clientIdentifier(request.headers));
    if (!limit.allowed) return rateLimitedResponse(limit.resetAt);

    const body = bodySchema.parse(await request.json());
    const isVideo = body.scope === "contentVideo";

    const allowedMimes = isVideo ? ALLOWED_VIDEO_MIME_TYPES : ALLOWED_IMAGE_MIME_TYPES;
    const allowedExtensions = isVideo ? ALLOWED_VIDEO_EXTENSIONS : ALLOWED_IMAGE_EXTENSIONS;
    const maxBytes = isVideo ? maxUploadBytes() : MAX_IMAGE_BYTES;

    if (!(allowedMimes as readonly string[]).includes(body.mimeType)) {
      throw new ApiError("BAD_REQUEST", `Unsupported media type: ${body.mimeType}.`);
    }

    const extension = (body.filename.split(".").pop() ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (!(allowedExtensions as readonly string[]).includes(extension)) {
      throw new ApiError("BAD_REQUEST", `Unsupported file extension: .${extension}`);
    }

    if (body.sizeBytes > maxBytes) {
      throw new ApiError(
        "BAD_REQUEST",
        `That file is ${(body.sizeBytes / 1048576).toFixed(1)}MB. The limit is ${(maxBytes / 1048576).toFixed(0)}MB.`,
      );
    }

    // Entity-scoped keys need a validated id; a bad one must never reach a key.
    if (body.scope !== "site") {
      const id = cuidSchema.safeParse(body.entityId ?? "");
      if (!id.success) throw new ApiError("BAD_REQUEST", "A valid record id is required.");
    }

    const target: AssetTarget =
      body.scope === "site"
        ? { kind: "site", slot: body.entityId ?? "general" }
        : body.scope === "contentThumbnail"
          ? { kind: "contentThumbnail", contentId: body.entityId! }
          : body.scope === "contentVideo"
            ? { kind: "contentVideo", contentId: body.entityId! }
            : body.scope === "creatorAvatar"
              ? { kind: "creatorAvatar", creatorId: body.entityId! }
              : { kind: "creatorBanner", creatorId: body.entityId! };

    const result = await authorizeDirectUpload({
      target,
      mimeType: body.mimeType,
      extension,
      maxSizeBytes: maxBytes,
    });

    if (!result) {
      // Honest fallback rather than a fabricated signed URL.
      return ok({
        mode: "proxy" as const,
        reason: "The configured storage backend cannot issue direct uploads.",
      });
    }

    console.info(`[media] upload authorized key=${result.objectKey} by=${admin.id}`);

    return ok({
      mode: "direct" as const,
      objectKey: result.objectKey,
      upload: result.authorization,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
