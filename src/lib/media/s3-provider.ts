import "server-only";
import {
  DeleteObjectsCommand,
  HeadBucketCommand,
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
 * S3-compatible object storage: AWS S3, Cloudflare R2, MinIO, Backblaze B2.
 *
 * Nothing in this file knows which of those it is talking to — the endpoint
 * and credentials come from the environment, so changing provider is a config
 * change. Credentials are read only here, on the server, and are never
 * serialised into a response.
 */
export type S3ProviderConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  publicUrl: string | null;
  forcePathStyle: boolean;
};

export class S3MediaProvider implements MediaStorageProvider {
  readonly id = "S3" as const;
  private client: S3Client | null = null;
  private readonly config: S3ProviderConfig | null;

  constructor(config?: S3ProviderConfig) {
    this.config = config ?? null;
  }

  private get s3(): S3Client {
    if (this.client) return this.client;
    const env = serverEnv();
    const config = this.config ?? {
      endpoint: env.STORAGE_ENDPOINT ?? "",
      region: env.STORAGE_REGION,
      bucket: env.STORAGE_BUCKET ?? "",
      accessKey: env.STORAGE_ACCESS_KEY ?? "",
      secretKey: env.STORAGE_SECRET_KEY ?? "",
      publicUrl: env.STORAGE_PUBLIC_URL ?? null,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    };

    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });
    return this.client;
  }

  private get bucket(): string {
    const bucket = this.config?.bucket ?? serverEnv().STORAGE_BUCKET;
    if (!bucket) throw new Error("Storage bucket is not configured");
    return bucket;
  }

  async upload(input: UploadInput): Promise<StoredObject> {
    const extension = normalizeExtension(input.filename.split(".").pop() ?? "");
    // Random key, not the caller's filename.
    const objectKey = `${input.prefix ?? "misc"}/${randomToken(12)}${extension}`;
    return this.putBuffer(objectKey, input.body, input.mimeType);
  }

  /** Writes a buffer at an exact key. Used by the pipeline for derived assets. */
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
        CacheControl: isPublicKey(objectKey)
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
      sizeBytes: body.byteLength,
    };
  }

  /** Streams a file from disk, so a multi-gigabyte source is never buffered. */
  async putFile(objectKey: string, filePath: string, contentType: string): Promise<StoredObject> {
    const { size } = await stat(filePath);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: contentType,
        CacheControl: isPublicKey(objectKey)
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

  async downloadToFile(object: { bucket?: string | null; objectKey: string }, filePath: string): Promise<void> {
    const response = await this.s3.send(new GetObjectCommand({ Bucket: object.bucket ?? this.bucket, Key: object.objectKey }));
    if (!response.Body) throw new Error("Storage returned an empty object body.");
    const { createWriteStream } = await import("node:fs");
    const { pipeline } = await import("node:stream/promises");
    await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(filePath));
  }

  async delete(object: StoredObject): Promise<void> {
    if (!object.objectKey) return;
    await this.deletePrefix(object.objectKey);
  }

  /** Removes every object under a prefix, a page at a time. */
  async deletePrefix(prefix: string): Promise<number> {
    let removed = 0;
    let token: string | undefined;

    do {
      const listed = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );

      const keys = (listed.Contents ?? [])
        .map((entry) => entry.Key)
        .filter((key): key is string => Boolean(key));

      if (keys.length > 0) {
        await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
        removed += keys.length;
      }

      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);

    return removed;
  }

  /**
   * Public CDN URL for derived assets; a short-lived signed URL for anything
   * private. The signature is generated server-side — no credential ever
   * reaches the browser.
   */
  async resolveUrl(object: StoredObject, options?: SignedUrlOptions): Promise<string> {
    if (!object.objectKey) return "";
    const env = serverEnv();
    const publicUrl = this.config?.publicUrl ?? env.STORAGE_PUBLIC_URL;

    if (isPublicKey(object.objectKey) && publicUrl) {
      return `${publicUrl.replace(/\/$/, "")}/${object.objectKey}`;
    }

    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: object.bucket ?? this.bucket,
        Key: object.objectKey,
        ...(options?.download ? { ResponseContentDisposition: "attachment" } : {}),
      }),
      { expiresIn: options?.expiresInSeconds ?? 900 },
    );
  }

  async testConnection(): Promise<void> {
    await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async exists(object: StoredObject): Promise<boolean> {
    return (await this.getMetadata(object)) !== null;
  }

  async getMetadata(object: StoredObject): Promise<ObjectMetadata | null> {
    if (!object.objectKey) return null;

    try {
      const head = await this.s3.send(
        new HeadObjectCommand({
          Bucket: object.bucket ?? this.bucket,
          Key: object.objectKey,
        }),
      );

      return {
        objectKey: object.objectKey,
        sizeBytes: head.ContentLength ?? 0,
        mimeType: head.ContentType ?? null,
        lastModified: head.LastModified ?? null,
        etag: head.ETag ?? null,
      };
    } catch {
      // A missing object is a normal answer here, not an error worth throwing.
      return null;
    }
  }

  /**
   * Issues a short-lived signed PUT so the browser uploads straight to the
   * bucket. The application never sees the bytes, and no credential leaves the
   * server — only a signature scoped to one key, one content type and one
   * expiry.
   *
   * Content-Type is part of the signature, so a client cannot substitute a
   * different type after authorization was granted for an image.
   */
  async createUploadAuthorization(params: {
    objectKey: string;
    mimeType: string;
    maxSizeBytes: number;
  }): Promise<PresignedUpload> {
    const expiresInSeconds = 600;

    const url = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.objectKey,
        ContentType: params.mimeType,
        CacheControl: isPublicKey(params.objectKey)
          ? "public, max-age=31536000, immutable"
          : "private, no-store",
      }),
      { expiresIn: expiresInSeconds },
    );

    return {
      url,
      method: "PUT",
      headers: { "Content-Type": params.mimeType },
      objectKey: params.objectKey,
      expiresInSeconds,
    };
  }
}
