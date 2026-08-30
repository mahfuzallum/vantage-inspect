import "server-only";
import { db } from "@/lib/db";
import { mediaProvider } from "@/lib/media";
import { storagePaths } from "@/lib/media/paths";
import { sanitizeFilename } from "@/lib/media/image-validation";
import { randomToken } from "@/lib/utils/hash";
import type { MediaKind } from "@prisma/client";
import type { ObjectMetadata, PresignedUpload } from "@/lib/media/types";

/**
 * Media records and their lifecycle.
 *
 * The single place that turns a stored object into a `MediaAsset` row and back
 * again. Storage keys are always built here from ids the application controls,
 * so no caller — however it was reached — can influence where bytes land.
 */

export type AssetTarget =
  | { kind: "contentThumbnail"; contentId: string }
  | { kind: "contentVideo"; contentId: string }
  | { kind: "creatorAvatar"; creatorId: string }
  | { kind: "creatorBanner"; creatorId: string }
  | { kind: "site"; slot: string };

/** Builds the object key for a target. The filename never contributes. */
export function keyForTarget(target: AssetTarget, extension: string): string {
  const token = randomToken(10);

  switch (target.kind) {
    case "contentThumbnail":
      return storagePaths.contentThumbnail(target.contentId, token, extension);
    case "contentVideo":
      return storagePaths.contentVideo(target.contentId, token, extension);
    case "creatorAvatar":
      return storagePaths.creatorAvatar(target.creatorId, token, extension);
    case "creatorBanner":
      return storagePaths.creatorBanner(target.creatorId, token, extension);
    case "site":
      return storagePaths.site(target.slot, token, extension);
  }
}

/**
 * Asks the configured backend for a direct-upload authorization.
 *
 * Returns null when the backend cannot issue one (local disk), which the
 * caller must treat as "post the file through the application instead" rather
 * than as a failure.
 */
export async function authorizeDirectUpload(params: {
  target: AssetTarget;
  mimeType: string;
  extension: string;
  maxSizeBytes: number;
}): Promise<{ authorization: PresignedUpload; objectKey: string } | null> {
  const provider = mediaProvider();
  if (!provider.createUploadAuthorization) return null;

  const objectKey = keyForTarget(params.target, params.extension);
  const authorization = await provider.createUploadAuthorization({
    objectKey,
    mimeType: params.mimeType,
    maxSizeBytes: params.maxSizeBytes,
  });

  return authorization ? { authorization, objectKey } : null;
}

/**
 * Records an asset after the bytes are in place.
 *
 * Crucially this verifies the object actually exists and reads its real size
 * from storage before writing a row: a client that requested an upload
 * authorization and never used it must not be able to register a phantom
 * asset, and a client-claimed size is not evidence of anything.
 */
export async function recordUploadedAsset(params: {
  objectKey: string;
  kind: MediaKind;
  mimeType: string;
  originalName: string;
  uploadedById: string;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
}): Promise<{ id: string; sizeBytes: number } | null> {
  const provider = mediaProvider();

  const metadata: ObjectMetadata | null = await provider.getMetadata({
    provider: provider.id,
    bucket: null,
    objectKey: params.objectKey,
    url: null,
    mimeType: params.mimeType,
    sizeBytes: null,
  });

  // No object, no record. This is the check that makes confirm-after-upload safe.
  if (!metadata) return null;

  const asset = await db.mediaAsset.create({
    data: {
      kind: params.kind,
      provider: provider.id,
      objectKey: params.objectKey,
      mimeType: metadata.mimeType ?? params.mimeType,
      sizeBytes: metadata.sizeBytes,
      originalName: sanitizeFilename(params.originalName),
      width: params.width ?? null,
      height: params.height ?? null,
      durationSeconds: params.durationSeconds ?? null,
      uploadedById: params.uploadedById,
      isPublic: true,
    },
    select: { id: true },
  });

  return { id: asset.id, sizeBytes: metadata.sizeBytes };
}

/** Records an asset that lives on someone else's server. */
export async function recordExternalAsset(params: {
  url: string;
  kind: MediaKind;
  uploadedById: string;
}): Promise<string> {
  const asset = await db.mediaAsset.create({
    data: {
      kind: params.kind,
      provider: "EXTERNAL",
      url: params.url,
      uploadedById: params.uploadedById,
      isPublic: true,
    },
    select: { id: true },
  });
  return asset.id;
}

/** How many records point at an asset. */
export async function referenceCount(assetId: string): Promise<number> {
  const asset = await db.mediaAsset.findUnique({
    where: { id: assetId },
    select: {
      _count: {
        select: { thumbnailFor: true, sourceFor: true, creatorAvatars: true, creatorBanners: true },
      },
    },
  });
  if (!asset) return 0;

  const counts = asset._count;
  return counts.thumbnailFor + counts.sourceFor + counts.creatorAvatars + counts.creatorBanners;
}

export type DeletionOutcome =
  | { status: "deleted" }
  | { status: "detached"; remainingReferences: number }
  | { status: "missing" }
  | { status: "storage-failed"; message: string };

/**
 * Deletes an asset — but only when nothing still points at it.
 *
 * A shared object (the same image used as two thumbnails) is never destroyed
 * because one of its users was removed; the caller is told how many references
 * remain instead. The database row is only dropped after storage confirms the
 * object is gone, so a storage failure cannot orphan bytes silently.
 */
export async function deleteAsset(
  assetId: string,
  options: { force?: boolean } = {},
): Promise<DeletionOutcome> {
  const asset = await db.mediaAsset.findUnique({
    where: { id: assetId },
    select: { id: true, provider: true, bucket: true, objectKey: true, url: true, mimeType: true },
  });
  if (!asset) return { status: "missing" };

  const references = await referenceCount(assetId);
  if (references > 0 && !options.force) {
    return { status: "detached", remainingReferences: references };
  }

  // External assets have no bytes of ours to remove.
  if (asset.provider !== "EXTERNAL" && asset.objectKey) {
    try {
      await mediaProvider().delete({
        provider: asset.provider,
        bucket: asset.bucket,
        objectKey: asset.objectKey,
        url: asset.url,
        mimeType: asset.mimeType,
        sizeBytes: null,
      });
    } catch (error) {
      console.error(`[media] storage delete failed for ${assetId}:`, error);
      return {
        status: "storage-failed",
        message: "The stored file could not be removed. The record was kept so it is not lost.",
      };
    }
  }

  await db.mediaAsset.delete({ where: { id: assetId } });
  return { status: "deleted" };
}

/**
 * Replaces the asset attached to a record.
 *
 * The old asset is detached first and only deleted if nothing else uses it,
 * which keeps "replace the thumbnail" from destroying an image that another
 * recording still displays.
 */
export async function replaceAsset(params: {
  previousAssetId: string | null;
  newAssetId: string;
  attach: (assetId: string) => Promise<void>;
}): Promise<void> {
  await params.attach(params.newAssetId);

  if (params.previousAssetId && params.previousAssetId !== params.newAssetId) {
    const outcome = await deleteAsset(params.previousAssetId);
    if (outcome.status === "detached") {
      console.info(
        `[media] previous asset ${params.previousAssetId} kept: ${outcome.remainingReferences} reference(s) remain`,
      );
    }
  }
}

export type OrphanReport = {
  /** Rows in the database that nothing references. */
  unreferencedRecords: Array<{
    id: string;
    objectKey: string | null;
    kind: MediaKind;
    sizeBytes: number | null;
    createdAt: Date;
  }>;
  /** Rows whose object is no longer present in storage. */
  missingObjects: Array<{ id: string; objectKey: string | null }>;
  scanned: number;
};

/**
 * Finds media that is out of step with storage — in either direction.
 *
 * Reports only. Nothing here deletes anything: an asset can look orphaned
 * simply because a draft referencing it has not been saved yet, and an
 * automatic sweep would quietly destroy real work. A human reviews the list
 * and acts on it from the admin page.
 */
export async function findOrphanedMedia(limit = 200): Promise<OrphanReport> {
  const assets = await db.mediaAsset.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      kind: true,
      provider: true,
      bucket: true,
      objectKey: true,
      url: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      _count: {
        select: { thumbnailFor: true, sourceFor: true, creatorAvatars: true, creatorBanners: true },
      },
    },
  });

  const unreferencedRecords: OrphanReport["unreferencedRecords"] = [];
  const missingObjects: OrphanReport["missingObjects"] = [];
  const provider = mediaProvider();

  for (const asset of assets) {
    const references =
      asset._count.thumbnailFor +
      asset._count.sourceFor +
      asset._count.creatorAvatars +
      asset._count.creatorBanners;

    if (references === 0) {
      unreferencedRecords.push({
        id: asset.id,
        objectKey: asset.objectKey,
        kind: asset.kind,
        sizeBytes: asset.sizeBytes,
        createdAt: asset.createdAt,
      });
    }

    if (asset.provider !== "EXTERNAL" && asset.objectKey) {
      const present = await provider.exists({
        provider: asset.provider,
        bucket: asset.bucket,
        objectKey: asset.objectKey,
        url: asset.url,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
      });
      if (!present) missingObjects.push({ id: asset.id, objectKey: asset.objectKey });
    }
  }

  return { unreferencedRecords, missingObjects, scanned: assets.length };
}
