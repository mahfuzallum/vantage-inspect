import type { MediaKind, StorageProvider } from "@prisma/client";

/**
 * What the application stores about a media object,
 * independent of the storage backend.
 */
export type StoredObject = {
  provider: StorageProvider;
  bucket: string | null;
  objectKey: string | null;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

/**
 * Input used when uploading an object through
 * the application server.
 */
export type UploadInput = {
  body: Buffer | Uint8Array;

  /**
   * Original filename.
   * Used only to derive a safe extension.
   */
  filename: string;

  mimeType: string;
  kind: MediaKind;

  /**
   * Logical folder such as:
   * thumbnails
   * sources
   * previews
   */
  prefix?: string;
};

/**
 * Options for resolving an object URL.
 */
export type SignedUrlOptions = {
  expiresInSeconds?: number;
  download?: boolean;
};

/**
 * Metadata returned directly by the storage backend.
 */
export type ObjectMetadata = {
  objectKey: string;
  sizeBytes: number;
  mimeType: string | null;
  lastModified: Date | null;
  etag: string | null;
};

/**
 * Authorization for direct browser -> storage uploads.
 */
export type PresignedUpload = {
  /**
   * URL where the browser uploads the bytes.
   */
  url: string;

  /**
   * HTTP method required by the storage provider.
   */
  method: "PUT" | "POST";

  /**
   * Headers that must be included with the request.
   */
  headers: Record<string, string>;

  /**
   * Storage object key.
   */
  objectKey: string;

  /**
   * Number of seconds before the authorization expires.
   */
  expiresInSeconds: number;
};

/**
 * Common interface implemented by every media backend.
 *
 * Local disk, S3 and R2 can therefore be swapped through
 * configuration without changing application code.
 */
export interface MediaStorageProvider {
  /**
   * Provider identifier.
   */
  readonly id: StorageProvider;

  /**
   * Upload an object through the application server.
   */
  upload(input: UploadInput): Promise<StoredObject>;

  /**
   * Delete a single object from storage.
   */
  delete(object: StoredObject): Promise<void>;

  /**
   * Delete every object whose key starts with the supplied prefix.
   *
   * This is required for generated media such as HLS:
   *
   * videos/hls/<contentId>/
   *
   * which contains the master playlist, variant playlists
   * and video segments.
   */
  deletePrefix(prefix: string): Promise<void>;

  /**
   * Resolve a browser-accessible URL.
   *
   * Public stores can return a normal URL.
   * Private stores can return a signed URL.
   */
  resolveUrl(
    object: StoredObject,
    options?: SignedUrlOptions,
  ): Promise<string>;

  /**
   * Check whether the object exists.
   */
  exists(object: StoredObject): Promise<boolean>;

  /**
   * Read metadata without downloading the object.
   */
  getMetadata(
    object: StoredObject,
  ): Promise<ObjectMetadata | null>;

  /**
   * Optional direct-to-storage upload authorization.
   *
   * Local storage does not support this and can return null.
   * S3/R2 production storage should implement it.
   */
  createUploadAuthorization?(params: {
    objectKey: string;
    mimeType: string;
    maxSizeBytes: number;
  }): Promise<PresignedUpload | null>;
}

/**
 * Allowed image MIME types.
 */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/**
 * Allowed video MIME types.
 */
export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
] as const;

/**
 * Allowed audio MIME types.
 */
export const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/mp4",
] as const;

/**
 * Validate an upload MIME type against its media kind.
 */
export function isAllowedUpload(
  mimeType: string,
  kind: MediaKind,
): boolean {
  switch (kind) {
    case "IMAGE":
      return (
        ALLOWED_IMAGE_TYPES as readonly string[]
      ).includes(mimeType);

    case "VIDEO":
      return (
        ALLOWED_VIDEO_TYPES as readonly string[]
      ).includes(mimeType);

    case "AUDIO":
      return (
        ALLOWED_AUDIO_TYPES as readonly string[]
      ).includes(mimeType);

    case "DOCUMENT":
      return mimeType === "application/pdf";

    default:
      return false;
  }
}