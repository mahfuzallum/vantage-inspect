import "server-only";

import type { MediaAsset } from "@prisma/client";

import { serverEnv } from "@/lib/env";
import { safeExternalUrl } from "@/lib/security/sanitize";

import { LocalMediaProvider } from "./local-provider";
import { S3MediaProvider } from "./s3-provider";

import type {
  MediaStorageProvider,
  SignedUrlOptions,
  StoredObject,
} from "./types";

export * from "./types";

let provider:
  | MediaStorageProvider
  | null = null;

/**
 * Return the configured media storage provider.
 *
 * LOCAL is used by default.
 * S3 is selected when MEDIA_PROVIDER=s3.
 */
export function mediaProvider(): MediaStorageProvider {
  if (!provider) {
    provider =
      serverEnv().MEDIA_PROVIDER === "s3"
        ? new S3MediaProvider()
        : new LocalMediaProvider();
  }

  return provider;
}

/**
 * Convert a complete Prisma MediaAsset into the
 * storage-neutral StoredObject representation.
 */
function toStoredObject(
  asset: MediaAsset,
): StoredObject {
  return {
    provider: asset.provider,
    bucket: asset.bucket,
    objectKey: asset.objectKey,
    url: asset.url,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
  };
}

/**
 * Resolve either:
 *
 * - a complete Prisma MediaAsset
 * - a storage object returned from a partial Prisma select
 *
 * This is intentionally typed around the fields actually required
 * by the storage provider. Admin list queries do not need to load
 * the entire MediaAsset row just to display a thumbnail.
 */
export async function resolveAssetUrl(
  asset:
    | MediaAsset
    | StoredObject
    | null
    | undefined,
  options?: SignedUrlOptions,
): Promise<string | null> {
  if (!asset) {
    return null;
  }

  /*
   * A complete Prisma MediaAsset has an id field.
   *
   * EXTERNAL assets are represented by their stored URL and must
   * never be sent to LOCAL/S3 storage.
   */
  if (
    "id" in asset &&
    asset.provider === "EXTERNAL"
  ) {
    return safeExternalUrl(
      asset.url,
    );
  }

  /*
   * Convert a complete Prisma MediaAsset into the storage-neutral
   * object expected by the provider.
   *
   * Partial thumbnail objects already match StoredObject and can
   * be passed through directly.
   */
  const storedObject =
    "id" in asset
      ? toStoredObject(asset)
      : asset;

  /*
   * If there is no storage key, fall back to the stored URL.
   */
  if (!storedObject.objectKey) {
    return storedObject.url ?? null;
  }

  /*
   * Resolve LOCAL or S3 storage through the configured provider.
   */
  const resolved =
    await mediaProvider().resolveUrl(
      storedObject,
      options,
    );

  return resolved || null;
}

/**
 * Delete a complete Prisma MediaAsset.
 *
 * Partial objects should use mediaProvider().delete() directly.
 */
export async function deleteAsset(
  asset: MediaAsset,
): Promise<void> {
  if (
    asset.provider === "EXTERNAL"
  ) {
    return;
  }

  await mediaProvider().delete(
    toStoredObject(asset),
  );
}