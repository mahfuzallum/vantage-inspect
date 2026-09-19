import "server-only";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import { serverEnv } from "@/lib/env";
import { randomToken } from "@/lib/utils/hash";
import { isPublicKey, normalizeExtension } from "./paths";

import type {
  CompletedUploadPart,
  MediaStorageProvider,
  MultipartUploadAuthorization,
  ObjectMetadata,
  PresignedUpload,
  PresignedUploadPart,
  SignedUrlOptions,
  StoredObject,
  UploadInput,
} from "./types";

/**
 * S3-compatible object storage:
 * AWS S3, Cloudflare R2, MinIO, Backblaze B2, etc.
 *
 * Credentials are server-side only.
 * Browser uploads use short-lived presigned URLs.
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

const DEFAULT_MULTIPART_PART_SIZE = 64 * 1024 * 1024;
const MIN_MULTIPART_PART_SIZE = 5 * 1024 * 1024;
const MAX_MULTIPART_PARTS = 10_000;
const MULTIPART_URL_EXPIRY_SECONDS = 3600;

function normalizePartSize(
  requested: number,
  fileSize: number,
): number {
  const minimum = Math.max(
    MIN_MULTIPART_PART_SIZE,
    Math.ceil(fileSize / MAX_MULTIPART_PARTS),
  );

  return Math.max(
    requested,
    minimum,
  );
}

export class S3MediaProvider implements MediaStorageProvider {
  readonly id = "S3" as const;

  private client: S3Client | null = null;

  private readonly config: S3ProviderConfig | null;

  constructor(config?: S3ProviderConfig) {
    this.config = config ?? null;
  }

  private get s3(): S3Client {
    if (this.client) {
      return this.client;
    }

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
      ...(config.endpoint
        ? { endpoint: config.endpoint }
        : {}),
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });

    return this.client;
  }

  private get bucket(): string {
    const bucket =
      this.config?.bucket ??
      serverEnv().STORAGE_BUCKET;

    if (!bucket) {
      throw new Error(
        "Storage bucket is not configured",
      );
    }

    return bucket;
  }

  async upload(
    input: UploadInput,
  ): Promise<StoredObject> {
    const extension = normalizeExtension(
      input.filename.split(".").pop() ?? "",
    );

    const objectKey =
      `${input.prefix ?? "misc"}/${randomToken(12)}${extension}`;

    return this.putBuffer(
      objectKey,
      input.body,
      input.mimeType,
    );
  }

  /**
   * Writes a buffer at an exact key.
   *
   * Used for thumbnails, playlists and other derived assets.
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

  /**
   * Streams a local file to S3/R2.
   *
   * The complete multi-gigabyte file is never loaded
   * into memory.
   */
  async putFile(
    objectKey: string,
    filePath: string,
    contentType: string,
  ): Promise<StoredObject> {
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

  async downloadToFile(
    object: {
      bucket?: string | null;
      objectKey: string;
    },
    filePath: string,
  ): Promise<void> {
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket:
          object.bucket?.trim() || this.bucket,
        Key: object.objectKey,
      }),
    );

    if (!response.Body) {
      throw new Error(
        "Storage returned an empty object body.",
      );
    }

    const { createWriteStream } =
      await import("node:fs");

    const { pipeline } =
      await import("node:stream/promises");

    await pipeline(
      response.Body as NodeJS.ReadableStream,
      createWriteStream(filePath),
    );
  }

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
   * Removes every object under a prefix,
   * one page at a time.
   */
  async deletePrefix(
    prefix: string,
  ): Promise<void> {
    let token: string | undefined;

    do {
      const listed =
        await this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );

      const keys =
        (listed.Contents ?? [])
          .map((entry) => entry.Key)
          .filter(
            (key): key is string =>
              Boolean(key),
          );

      if (keys.length > 0) {
        await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: keys.map(
                (Key) => ({ Key }),
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
   * Resolves a browser-accessible URL.
   *
   * Public objects use the configured public URL.
   * Private objects use a short-lived signed GET.
   */
  async resolveUrl(
    object: StoredObject,
    options?: SignedUrlOptions,
  ): Promise<string> {
    if (!object.objectKey) {
      return "";
    }

    const env = serverEnv();

    const publicUrl =
      this.config?.publicUrl ??
      env.STORAGE_PUBLIC_URL;

    if (
      isPublicKey(object.objectKey) &&
      publicUrl
    ) {
      return `${publicUrl.replace(
        /\/$/,
        "",
      )}/${object.objectKey}`;
    }

    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket:
          object.bucket?.trim() || this.bucket,
        Key: object.objectKey,
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

  async testConnection(): Promise<void> {
    await this.s3.send(
      new HeadBucketCommand({
        Bucket: this.bucket,
      }),
    );
  }

  async exists(
    object: StoredObject,
  ): Promise<boolean> {
    return (
      (await this.getMetadata(object)) !==
      null
    );
  }

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
              object.bucket?.trim() || this.bucket,
            Key: object.objectKey,
          }),
        );

      return {
        objectKey: object.objectKey,
        sizeBytes:
          head.ContentLength ?? 0,
        mimeType:
          head.ContentType ?? null,
        lastModified:
          head.LastModified ?? null,
        etag:
          head.ETag ?? null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Normal single PUT authorization.
   *
   * Kept for smaller uploads and backwards compatibility.
   */
  async createUploadAuthorization(
    params: {
      objectKey: string;
      mimeType: string;
      maxSizeBytes: number;
    },
  ): Promise<PresignedUpload> {
    const expiresInSeconds = 600;

    const url =
      await getSignedUrl(
        this.s3,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: params.objectKey,
          ContentType: params.mimeType,
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

  /**
   * Starts a multipart upload and creates a presigned
   * PUT URL for every part.
   *
   * The server never receives the actual video bytes.
   */
  async createMultipartUploadAuthorization(
    params: {
      objectKey: string;
      mimeType: string;
      sizeBytes: number;
      partSizeBytes: number;
    },
  ): Promise<MultipartUploadAuthorization> {
    if (
      params.sizeBytes <= 0
    ) {
      throw new Error(
        "Multipart upload size must be positive.",
      );
    }

    const partSize =
      normalizePartSize(
        params.partSizeBytes ||
          DEFAULT_MULTIPART_PART_SIZE,
        params.sizeBytes,
      );

    const partCount =
      Math.ceil(
        params.sizeBytes /
          partSize,
      );

    if (
      partCount >
      MAX_MULTIPART_PARTS
    ) {
      throw new Error(
        "Multipart upload requires more than 10,000 parts.",
      );
    }

    const started =
      await this.s3.send(
        new CreateMultipartUploadCommand({
          Bucket: this.bucket,
          Key: params.objectKey,
          ContentType:
            params.mimeType,
          CacheControl:
            isPublicKey(
              params.objectKey,
            )
              ? "public, max-age=31536000, immutable"
              : "private, no-store",
        }),
      );

    if (!started.UploadId) {
      throw new Error(
        "Storage did not return a multipart upload ID.",
      );
    }

    const parts: PresignedUploadPart[] =
      [];

    try {
      for (
        let partNumber = 1;
        partNumber <= partCount;
        partNumber += 1
      ) {
        const url =
          await getSignedUrl(
            this.s3,
            new UploadPartCommand({
              Bucket:
                this.bucket,
              Key:
                params.objectKey,
              UploadId:
                started.UploadId,
              PartNumber:
                partNumber,
            }),
            {
              expiresIn:
                MULTIPART_URL_EXPIRY_SECONDS,
            },
          );

        parts.push({
          partNumber,
          url,
          method: "PUT",
          headers: {},
          expiresInSeconds:
            MULTIPART_URL_EXPIRY_SECONDS,
        });
      }
    } catch (error) {
      await this.abortMultipartUpload({
        objectKey:
          params.objectKey,
        uploadId:
          started.UploadId,
      }).catch(() => undefined);

      throw error;
    }

    return {
      uploadId:
        started.UploadId,
      objectKey:
        params.objectKey,
      partSizeBytes:
        partSize,
      parts,
      expiresInSeconds:
        MULTIPART_URL_EXPIRY_SECONDS,
    };
  }

  /**
   * Completes a multipart upload after the browser
   * has successfully uploaded every part.
   */
  async completeMultipartUpload(
    params: {
      objectKey: string;
      uploadId: string;
      parts: CompletedUploadPart[];
    },
  ): Promise<StoredObject | null> {
    let suppliedParts = [...params.parts];

    // If the browser cannot expose ETag because of storage CORS, recover the
    // authoritative uploaded-part list from S3/R2 server-side.
    if (suppliedParts.length === 0) {
      const listed = await this.s3.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: params.objectKey,
          UploadId: params.uploadId,
        }),
      );
      suppliedParts = (listed.Parts ?? [])
        .filter((part) => Number.isInteger(part.PartNumber) && Boolean(part.ETag))
        .map((part) => ({ partNumber: part.PartNumber as number, etag: part.ETag as string }));
    }

    if (!suppliedParts.length) {
      throw new Error("Multipart upload has no completed parts.");
    }

    const sortedParts =
      [...suppliedParts].sort(
        (a, b) =>
          a.partNumber -
          b.partNumber,
      );

    const validParts =
      sortedParts.every(
        (part, index) =>
          part.partNumber ===
            index + 1 &&
          Boolean(part.etag),
      );

    if (!validParts) {
      throw new Error(
        "Multipart upload parts are invalid or incomplete.",
      );
    }

    const completed =
      await this.s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: params.objectKey,
          UploadId:
            params.uploadId,
          MultipartUpload: {
            Parts:
              sortedParts.map(
                (part) => ({
                  PartNumber:
                    part.partNumber,
                  ETag:
                    part.etag,
                }),
              ),
          },
        }),
      );

    if (
      !completed.Key
    ) {
      return null;
    }

    return {
      provider: "S3",
      bucket: this.bucket,
      objectKey:
        completed.Key,
      url: null,
      mimeType:
        completed.ChecksumType
          ? null
          : null,
      sizeBytes: null,
    };
  }

  /**
   * Aborts an incomplete multipart upload.
   *
   * This is important so failed uploads do not leave
   * unfinished parts behind in R2.
   */
  async abortMultipartUpload(
    params: {
      objectKey: string;
      uploadId: string;
    },
  ): Promise<void> {
    await this.s3.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: params.objectKey,
        UploadId:
          params.uploadId,
      }),
    );
  }
}