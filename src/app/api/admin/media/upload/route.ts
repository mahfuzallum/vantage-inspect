import type { NextRequest } from "next/server";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { requireApiRole } from "@/lib/auth/guards";
import { serverEnv } from "@/lib/env";
import { handleRouteError, ok, rateLimitedResponse } from "@/lib/api/response";
import { ApiError } from "@/lib/api/errors";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";
import { MAX_IMAGE_BYTES, validateImage } from "@/lib/media/image-validation";
import { readImageDimensions } from "@/lib/media/image-dimensions";
import {
  keyForTarget,
  recordUploadedAsset,
  type AssetTarget,
} from "@/server/services/media-service";
import { resolveAssetUrl } from "@/lib/media";
import { db } from "@/lib/db";
import { cuidSchema } from "@/validation/common";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Proxy upload for images, used when the backend cannot sign direct uploads.
 *
 * Images are small enough that routing them through the application is
 * acceptable; large video never takes this path. Bytes are validated by their
 * magic numbers before anything is written, and a failure removes whatever was
 * partially written rather than leaving it on disk.
 */
export async function POST(request: NextRequest) {
  let writtenPath: string | null = null;

  try {
    const admin = await requireApiRole("ADMIN", "MODERATOR");

    const limit = await rateLimit("upload", clientIdentifier(request.headers));
    if (!limit.allowed) return rateLimitedResponse(limit.resetAt);

    const form = await request.formData();
    const file = form.get("file");
    const scope = String(form.get("scope") ?? "");
    const entityId = String(form.get("entityId") ?? "");

    if (!(file instanceof File)) throw new ApiError("BAD_REQUEST", "No file was received.");

    const bytes = Buffer.from(await file.arrayBuffer());

    const check = validateImage({
      filename: file.name,
      sizeBytes: bytes.byteLength,
      declaredMime: file.type,
      head: bytes.subarray(0, 32),
      maxSizeBytes: MAX_IMAGE_BYTES,
    });
    if (!check.ok) throw new ApiError("BAD_REQUEST", check.reason);

    if (scope !== "site" && !cuidSchema.safeParse(entityId).success) {
      throw new ApiError("BAD_REQUEST", "A valid record id is required.");
    }

    const target: AssetTarget =
      scope === "creatorAvatar"
        ? { kind: "creatorAvatar", creatorId: entityId }
        : scope === "creatorBanner"
          ? { kind: "creatorBanner", creatorId: entityId }
          : scope === "site"
            ? { kind: "site", slot: entityId || "general" }
            : { kind: "contentThumbnail", contentId: entityId };

    const objectKey = keyForTarget(target, check.extension);

    // Written under the media root only; the key is generated, never supplied.
    writtenPath = path.join(serverEnv().MEDIA_LOCAL_ROOT, objectKey);
    await mkdir(path.dirname(writtenPath), { recursive: true });
    await writeFile(writtenPath, bytes);

    // Read from the bytes we just verified, never from the client. Null is a
    // fine outcome: a missing dimension only costs a layout hint.
    const dimensions = readImageDimensions(bytes, check.detectedMime);

    const asset = await recordUploadedAsset({
      objectKey,
      kind: "IMAGE",
      mimeType: check.detectedMime,
      originalName: file.name,
      uploadedById: admin.id,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    });
    if (!asset) throw new ApiError("INTERNAL", "The file was written but could not be recorded.");

    const record = await db.mediaAsset.findUnique({ where: { id: asset.id } });
    const url = await resolveAssetUrl(record);

    console.info(`[media] proxy upload recorded asset=${asset.id} bytes=${asset.sizeBytes}`);

    return ok({ assetId: asset.id, url, sizeBytes: asset.sizeBytes }, { status: 201 });
  } catch (error) {
    if (writtenPath) await unlink(writtenPath).catch(() => undefined);
    return handleRouteError(error);
  }
}
