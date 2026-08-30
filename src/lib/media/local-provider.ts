import "server-only";

import {
  copyFile,
  mkdir,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

import { randomToken } from "@/lib/utils/hash";
import { serverEnv } from "@/lib/env";

import type {
  MediaStorageProvider,
  ObjectMetadata,
  StoredObject,
  UploadInput,
} from "./types";

/**
 * Filesystem storage for local development and single-server deployments.
 *
 * IMPORTANT:
 *
 * MEDIA_LOCAL_ROOT should point to a storage directory outside `public`.
 *
 * Example:
 *
 * MEDIA_LOCAL_ROOT="./storage/uploads"
 *
 * This prevents generated HLS `.ts` segments from being scanned by
 * Next.js as TypeScript source files during `next build`.
 */
export class LocalMediaProvider
  implements MediaStorageProvider
{
  readonly id = "LOCAL" as const;

  /**
   * Store a newly uploaded file using a generated filename.
   *
   * Uploaded filenames are never trusted as a storage path.
   */
  async upload(
    input: UploadInput,
  ): Promise<StoredObject> {
    const env = serverEnv();

    const extension =
      path
        .extname(input.filename)
        .toLowerCase()
        .replace(
          /[^.a-z0-9]/g,
          "",
        );

    const prefix =
      input.prefix ?? "misc";

    const objectKey =
      path.posix.join(
        prefix,
        `${randomToken(12)}${extension}`,
      );

    const absolute =
      this.resolveObjectPath(
        env.MEDIA_LOCAL_ROOT,
        objectKey,
      );

    await mkdir(
      path.dirname(absolute),
      {
        recursive: true,
      },
    );

    await writeFile(
      absolute,
      input.body,
    );

    return {
      provider: "LOCAL",
      bucket: null,
      objectKey,
      url: null,
      mimeType: input.mimeType,
      sizeBytes:
        input.body.byteLength,
    };
  }

  /**
   * Write a buffer to an exact object key.
   *
   * Used by the video worker for generated files such as:
   *
   * videos/hls/<id>/master.m3u8
   * videos/hls/<id>/1080p/playlist.m3u8
   */
  async putBuffer(
    objectKey: string,
    body: Buffer,
    contentType: string,
  ): Promise<StoredObject> {
    const env = serverEnv();

    const absolute =
      this.resolveObjectPath(
        env.MEDIA_LOCAL_ROOT,
        objectKey,
      );

    await mkdir(
      path.dirname(absolute),
      {
        recursive: true,
      },
    );

    await writeFile(
      absolute,
      body,
    );

    return {
      provider: "LOCAL",
      bucket: null,
      objectKey,
      url: null,
      mimeType: contentType,
      sizeBytes:
        body.byteLength,
    };
  }

  /**
   * Copy a generated FFmpeg output file into storage.
   *
   * Used for:
   *
   * - HLS segments
   * - HLS playlists
   * - thumbnails
   * - previews
   */
  async putFile(
    objectKey: string,
    filePath: string,
    contentType: string,
  ): Promise<StoredObject> {
    const env = serverEnv();

    const absolute =
      this.resolveObjectPath(
        env.MEDIA_LOCAL_ROOT,
        objectKey,
      );

    await mkdir(
      path.dirname(absolute),
      {
        recursive: true,
      },
    );

    await copyFile(
      filePath,
      absolute,
    );

    const info =
      await stat(
        absolute,
      );

    return {
      provider: "LOCAL",
      bucket: null,
      objectKey,
      url: null,
      mimeType: contentType,
      sizeBytes:
        info.size,
    };
  }

  /**
   * Delete one stored object.
   */
  async delete(
    object: StoredObject,
  ): Promise<void> {
    if (!object.objectKey) {
      return;
    }

    const env = serverEnv();

    const absolute =
      this.resolveObjectPath(
        env.MEDIA_LOCAL_ROOT,
        object.objectKey,
      );

    await unlink(
      absolute,
    ).catch(
      () => undefined,
    );
  }

  /**
   * Delete every object under a prefix.
   *
   * This is used when removing a complete recording
   * together with its generated media assets.
   *
   * Example:
   *
   * videos/hls/cmt123/
   *
   * removes:
   *
   * videos/hls/cmt123/master.m3u8
   * videos/hls/cmt123/1080p/playlist.m3u8
   * videos/hls/cmt123/1080p/segment-0000.ts
   * videos/hls/cmt123/720p/...
   */
  async deletePrefix(
    prefix: string,
  ): Promise<void> {
    const env = serverEnv();

    const normalizedPrefix =
      prefix
        .replace(
          /\\/g,
          "/",
        )
        .replace(
          /^\/+/,
          "",
        );

    if (
      !normalizedPrefix ||
      normalizedPrefix.includes(
        "\0",
      )
    ) {
      throw new Error(
        "Unsafe media prefix.",
      );
    }

    /*
     * Reject traversal explicitly.
     */
    const segments =
      normalizedPrefix.split("/");

    if (
      segments.includes("..") ||
      segments.includes(".")
    ) {
      throw new Error(
        "Unsafe media prefix.",
      );
    }

    /*
     * Resolve the prefix through the same
     * filesystem boundary protection used
     * for individual objects.
     */
    const absolute =
      this.resolveObjectPath(
        env.MEDIA_LOCAL_ROOT,
        normalizedPrefix,
      );

    /*
     * Remove the directory recursively.
     *
     * force:true makes deletion idempotent.
     */
    await rm(
      absolute,
      {
        recursive: true,
        force: true,
      },
    ).catch(
      () => undefined,
    );
  }

  /**
   * Resolve a stored object to the application's
   * media-serving URL.
   *
   * The actual /media/* route reads the filesystem
   * and supports HTTP range requests.
   */
  async resolveUrl(
    object: StoredObject,
  ): Promise<string> {
    if (!object.objectKey) {
      return "";
    }

    const base =
      serverEnv()
        .MEDIA_PUBLIC_BASE_URL
        .replace(
          /\/$/,
          "",
        );

    return `${base}/${object.objectKey
      .split("/")
      .map(
        encodeURIComponent,
      )
      .join("/")}`;
  }

  /**
   * Check whether an object exists.
   */
  async exists(
    object: StoredObject,
  ): Promise<boolean> {
    const absolute =
      this.absolutePath(
        object,
      );

    if (!absolute) {
      return false;
    }

    return stat(
      absolute,
    )
      .then(
        () => true,
      )
      .catch(
        () => false,
      );
  }

  /**
   * Read filesystem metadata.
   */
  async getMetadata(
    object: StoredObject,
  ): Promise<ObjectMetadata | null> {
    const absolute =
      this.absolutePath(
        object,
      );

    if (
      !absolute ||
      !object.objectKey
    ) {
      return null;
    }

    try {
      const info =
        await stat(
          absolute,
        );

      if (!info.isFile()) {
        return null;
      }

      return {
        objectKey:
          object.objectKey,

        sizeBytes:
          info.size,

        mimeType:
          object.mimeType,

        lastModified:
          info.mtime,

        etag:
          null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Local storage cannot create a signed
   * browser upload.
   *
   * The application upload endpoint handles
   * the upload directly.
   */
  async createUploadAuthorization(): Promise<null> {
    return null;
  }

  /**
   * Convert a storage object key into an
   * absolute filesystem path.
   *
   * The resulting path must remain inside
   * MEDIA_LOCAL_ROOT.
   *
   * This protects local filesystem storage
   * from path traversal.
   */
  private resolveObjectPath(
    root: string,
    objectKey: string,
  ): string {
    const normalizedRoot =
      path.resolve(
        root,
      );

    const normalizedKey =
      objectKey
        .replace(
          /\\/g,
          "/",
        )
        .replace(
          /^\/+/,
          "",
        );

    /*
     * Reject empty object keys.
     */
    if (!normalizedKey) {
      throw new Error(
        "Media object key is required.",
      );
    }

    /*
     * Reject null bytes.
     */
    if (
      normalizedKey.includes(
        "\0",
      )
    ) {
      throw new Error(
        "Unsafe media object key.",
      );
    }

    /*
     * Reject traversal before resolving.
     */
    const segments =
      normalizedKey.split("/");

    if (
      segments.some(
        (
          segment,
        ) =>
          segment === ".." ||
          segment === ".",
      )
    ) {
      throw new Error(
        "Unsafe media object key.",
      );
    }

    const absolute =
      path.resolve(
        normalizedRoot,
        normalizedKey,
      );

    const relative =
      path.relative(
        normalizedRoot,
        absolute,
      );

    /*
     * If the relative path starts with
     * `..`, the object escaped the root.
     */
    if (
      relative === ".." ||
      relative.startsWith(
        `..${path.sep}`,
      ) ||
      path.isAbsolute(
        relative,
      )
    ) {
      throw new Error(
        "Media object path escapes the configured storage root.",
      );
    }

    return absolute;
  }

  /**
   * Resolve an object's absolute filesystem path.
   */
  private absolutePath(
    object: StoredObject,
  ): string | null {
    if (!object.objectKey) {
      return null;
    }

    return this.resolveObjectPath(
      serverEnv()
        .MEDIA_LOCAL_ROOT,
      object.objectKey,
    );
  }
}