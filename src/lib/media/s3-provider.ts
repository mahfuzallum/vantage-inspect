import "server-only";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import { serverEnv } from "@/lib/env";
import { randomToken } from "@/lib/utils/hash";
import { isPublicKey, normalizeExtension } from "./paths";

import type {
  MediaStorageProvider,
  ObjectMetadata,
  PresignedUpload,
  SignedUrlOptions,
  StoredObject,
  UploadInput,
} from "./types";

/**
 * S3-compatible object storage:
 *
 * - AWS S3
 * - Cloudflare R2
 * - MinIO
 * - Backblaze B2
 *
 * The provider is selected entirely through environment configuration.
 *
 * Credentials are only accessed on the server and are never returned
 * to the browser.
 */
export class S3MediaProvider
  implements MediaStorageProvider
{
  readonly id = "S3" as const;

  private client: S3Client | null = null;

  /**
   * Lazily create the S3 client.
   */
  private get s3(): S3Client {
    if (this.client) {
      return this.client;
    }

    const env = serverEnv();

    this.client = new S3Client({
      region: env.STORAGE_REGION,

      ...(env.STORAGE_ENDPOINT
        ? {
            endpoint:
              env.STORAGE_ENDPOINT,
          }
        : {}),

      forcePathStyle:
        env.STORAGE_FORCE_PATH_STYLE,

      credentials: {
        accessKeyId:
          env.STORAGE_ACCESS_KEY!,

        secretAccessKey:
          env.STORAGE_SECRET_KEY!,
      },
    });

    return this.client;
  }

  /**
   * Configured storage bucket.
   */
  private get bucket(): string {
    const bucket =
      serverEnv().STORAGE_BUCKET;

    if (!bucket) {
      throw new Error(
        "STORAGE_BUCKET is not configured",
      );
    }

    return bucket;
  }

  /**
   * Upload an object using a generated storage key.
   *
   * The original filename is only used to determine the extension.
   */
  async upload(
    input: UploadInput,
  ): Promise<StoredObject> {
    const extension =
      normalizeExtension(
        input.filename
          .split(".")
          .pop() ?? "",
      );

    /*
     * Never use the caller's filename as
     * the storage object name.
     */
    const objectKey =
      `${input.prefix ?? "misc"}/` +
      `${randomToken(12)}${extension}`;

    return this.putBuffer(
      objectKey,
      input.body,
      input.mimeType,
    );
  }

  /**
   * Write a buffer to an exact storage key.
   *
   * Used by generated assets such as:
   *
   * - HLS master playlist
   * - HLS playlists
   * - small generated assets
   */
  async putBuffer(
    objectKey: string,
    body: Buffer | Uint8Array,
    contentType: string,
  ): Promise<StoredObject> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,

        Key: objectKey,

        Body: body,

        ContentType: contentType,

        CacheControl:
          isPublicKey(objectKey)
            ? "public, max-age=31536000, immutable"
            : "private, no-store",
      }),
    );

    return {
      provider: "S3",

      bucket: this.bucket,

      objectKey,

      url: null,

      mimeType: contentType,

      sizeBytes:
        body.byteLength,
    };
  }

  /**
   * Stream a local file directly into S3-compatible storage.
   *
   * This avoids buffering large video files into memory.
   */
  async putFile(
    objectKey: string,
    filePath: string,
    contentType: string,
  ): Promise<StoredObject> {
    const { size } =
      await stat(filePath);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,

        Key: objectKey,

        Body: createReadStream(
          filePath,
        ),

        ContentLength: size,

        ContentType: contentType,

        CacheControl:
          isPublicKey(objectKey)
            ? "public, max-age=31536000, immutable"
            : "private, no-store",
      }),
    );

    return {
      provider: "S3",

      bucket: this.bucket,

      objectKey,

      url: null,

      mimeType: contentType,

      sizeBytes: size,
    };
  }

  /**
   * Delete one stored object.
   *
   * Internally this uses deletePrefix(),
   * which also makes deletion work for
   * generated asset directories.
   */
  async delete(
    object: StoredObject,
  ): Promise<void> {
    if (!object.objectKey) {
      return;
    }

    await this.deletePrefix(
      object.objectKey,
    );
  }

  /**
   * Delete every object beginning with
   * the supplied prefix.
   *
   * S3 ListObjectsV2 is paginated, so this
   * continues until every page has been removed.
   *
   * The interface intentionally returns void.
   */
  async deletePrefix(
    prefix: string,
  ): Promise<void> {
    let token:
      | string
      | undefined;

    do {
      const listed =
        await this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,

            Prefix: prefix,

            ContinuationToken:
              token,
          }),
        );

      const keys =
        (listed.Contents ?? [])
          .map(
            (entry) =>
              entry.Key,
          )
          .filter(
            (
              key,
            ): key is string =>
              Boolean(key),
          );

      if (keys.length > 0) {
        await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,

            Delete: {
              Objects:
                keys.map(
                  (Key) => ({
                    Key,
                  }),
                ),
            },
          }),
        );
      }

      token =
        listed.IsTruncated
          ? listed.NextContinuationToken
          : undefined;
    } while (token);
  }

  /**
   * Resolve an object to a browser-accessible URL.
   *
   * Public derived assets use the configured
   * public/CDN URL.
   *
   * Private objects receive a short-lived
   * signed URL.
   */
  async resolveUrl(
    object: StoredObject,
    options?: SignedUrlOptions,
  ): Promise<string> {
    if (!object.objectKey) {
      return "";
    }

    const env =
      serverEnv();

    /*
     * Public derived media:
     *
     * thumbnail
     * preview
     * HLS
     * creator assets
     * site assets
     */
    if (
      isPublicKey(
        object.objectKey,
      ) &&
      env.STORAGE_PUBLIC_URL
    ) {
      return (
        env.STORAGE_PUBLIC_URL.replace(
          /\/$/,
          "",
        ) +
        "/" +
        object.objectKey
      );
    }

    /*
     * Private media receives a
     * short-lived signed URL.
     */
    return getSignedUrl(
      this.s3,

      new GetObjectCommand({
        Bucket:
          object.bucket ??
          this.bucket,

        Key:
          object.objectKey,

        ...(options?.download
          ? {
              ResponseContentDisposition:
                "attachment",
            }
          : {}),
      }),

      {
        expiresIn:
          options?.expiresInSeconds ??
          900,
      },
    );
  }

  /**
   * Check whether an object exists.
   */
  async exists(
    object: StoredObject,
  ): Promise<boolean> {
    return (
      (
        await this.getMetadata(
          object,
        )
      ) !== null
    );
  }

  /**
   * Read object metadata without
   * downloading its contents.
   */
  async getMetadata(
    object: StoredObject,
  ): Promise<ObjectMetadata | null> {
    if (!object.objectKey) {
      return null;
    }

    try {
      const head =
        await this.s3.send(
          new HeadObjectCommand({
            Bucket:
              object.bucket ??
              this.bucket,

            Key:
              object.objectKey,
          }),
        );

      return {
        objectKey:
          object.objectKey,

        sizeBytes:
          head.ContentLength ??
          0,

        mimeType:
          head.ContentType ??
          null,

        lastModified:
          head.LastModified ??
          null,

        etag:
          head.ETag ??
          null,
      };
    } catch {
      /*
       * Missing objects are represented
       * by null rather than throwing.
       */
      return null;
    }
  }

  /**
   * Create a short-lived signed PUT URL.
   *
   * The browser receives permission for
   * one exact object key and content type.
   *
   * Credentials never leave the server.
   */
  async createUploadAuthorization(
    params: {
      objectKey: string;
      mimeType: string;
      maxSizeBytes: number;
    },
  ): Promise<PresignedUpload> {
    const expiresInSeconds =
      600;

    const url =
      await getSignedUrl(
        this.s3,

        new PutObjectCommand({
          Bucket: this.bucket,

          Key:
            params.objectKey,

          ContentType:
            params.mimeType,

          CacheControl:
            isPublicKey(
              params.objectKey,
            )
              ? "public, max-age=31536000, immutable"
              : "private, no-store",
        }),

        {
          expiresIn:
            expiresInSeconds,
        },
      );

    return {
      url,

      method: "PUT",

      headers: {
        "Content-Type":
          params.mimeType,
      },

      objectKey:
        params.objectKey,

      expiresInSeconds,
    };
  }
}