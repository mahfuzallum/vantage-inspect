import "server-only";

import {
  mkdir,
  readdir,
  readFile,
  stat,
} from "node:fs/promises";

import path from "node:path";

import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { FfmpegError } from "./ffmpeg";

import {
  cleanupWorkDir,
  processVideo,
} from "./processor";

import {
  claimNextJob,
  markJobFailed,
  markJobSucceeded,
  reclaimStalledJobs,
} from "./queue";

import { S3MediaProvider } from "@/lib/media/s3-provider";
import { LocalMediaProvider } from "@/lib/media/local-provider";
import { storagePaths } from "@/lib/media/paths";

const SEGMENT_CONTENT_TYPE = "video/mp2t";
const PLAYLIST_CONTENT_TYPE =
  "application/vnd.apple.mpegurl";
const PREVIEW_CONTENT_TYPE = "image/webp";
const THUMBNAIL_CONTENT_TYPE = "image/webp";

function isRetryable(error: unknown): boolean {
  if (error instanceof FfmpegError) {
    return false;
  }

  return true;
}

function safeMessage(error: unknown): string {
  if (error instanceof FfmpegError) {
    return `${error.message}: ${error.detail}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown processing error.";
}

type Uploader = {
  putFile(
    key: string,
    filePath: string,
    contentType: string,
  ): Promise<{
    provider?: unknown;
    bucket?: string | null;
    objectKey?: string | null;
    url?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
  }>;

  putBuffer(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<{
    provider?: unknown;
    bucket?: string | null;
    objectKey?: string | null;
    url?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
  }>;
};

function uploader(): Uploader {
  return serverEnv().MEDIA_PROVIDER === "s3"
    ? (new S3MediaProvider() as unknown as Uploader)
    : (new LocalMediaProvider() as unknown as Uploader);
}

async function uploadRendition(
  store: Uploader,
  videoId: string,
  label: string,
  localDir: string,
): Promise<void> {
  const files = await readdir(localDir);

  for (
    const file of files.filter((name) =>
      name.endsWith(".ts"),
    )
  ) {
    await store.putFile(
      `${storagePaths.hlsVariantDir(
        videoId,
        label,
      )}/${file}`,
      path.join(localDir, file),
      SEGMENT_CONTENT_TYPE,
    );
  }

  await store.putFile(
    storagePaths.hlsVariantPlaylist(
      videoId,
      label,
    ),
    path.join(
      localDir,
      "playlist.m3u8",
    ),
    PLAYLIST_CONTENT_TYPE,
  );
}

export type JobOutcome =
  | "succeeded"
  | "retrying"
  | "failed"
  | "idle";

export async function runOneJob(
  workerId: string,
): Promise<JobOutcome> {
  const job = await claimNextJob(workerId);

  if (!job) {
    return "idle";
  }

  const env = serverEnv();

  const workDir = path.join(
    env.VIDEO_WORK_DIR,
    job.contentId,
  );

  console.info(
    `[worker] processing started content=${job.contentId} attempt=${job.attempts}`,
  );

  try {
    await db.content.update({
      where: {
        id: job.contentId,
      },

      data: {
        processingStatus: "PROCESSING",
        processingStartedAt: new Date(),
        processingAttempts: job.attempts,
        processingError: null,
      },
    });

    const content =
      await db.content.findUnique({
        where: {
          id: job.contentId,
        },

        select: {
          id: true,

          source: {
            select: {
              id: true,
              objectKey: true,
              provider: true,
              bucket: true,
              url: true,
              mimeType: true,
              sizeBytes: true,
            },
          },

          thumbnail: {
            select: {
              id: true,
              provider: true,
              bucket: true,
              objectKey: true,
              url: true,
              mimeType: true,
              sizeBytes: true,
            },
          },
        },
      });

    const sourceKey =
      content?.source?.objectKey;

    if (!sourceKey) {
      throw new FfmpegError(
        "No source file is attached to this recording.",
        "missing source",
      );
    }

    const source = content?.source;

    if (!source) {
      throw new FfmpegError(
        "No source media asset is attached to this recording.",
        "missing source asset",
      );
    }

    if (source.provider !== "LOCAL") {
      throw new FfmpegError(
        "This worker currently requires local source storage.",
        `provider=${source.provider}`,
      );
    }

    if (!source.objectKey) {
      throw new FfmpegError(
        "The source media asset has no storage key.",
        "missing source object key",
      );
    }

    const localSource = path.join(
      env.MEDIA_LOCAL_ROOT,
      source.objectKey,
    );

    await stat(localSource).catch(() => {
      throw new FfmpegError(
        "The source file could not be found in storage.",
        sourceKey,
      );
    });

    await mkdir(workDir, {
      recursive: true,
    });

    const output = await processVideo(
      localSource,
      workDir,
      job.contentId,
    );

    const store = uploader();

    /*
     * -------------------------------------------------
     * 1. THUMBNAIL
     * -------------------------------------------------
     */

    const thumbnailKey =
      storagePaths.thumbnail(
        job.contentId,
      );

    const thumbnailObject =
      await store.putFile(
        thumbnailKey,
        output.thumbnailPath,
        THUMBNAIL_CONTENT_TYPE,
      );

    console.info(
      `[worker] thumbnail uploaded content=${job.contentId} key=${thumbnailKey}`,
    );

    /*
     * Create a MediaAsset record for the generated
     * thumbnail and attach it to Content.thumbnailId.
     */
    const thumbnailAsset =
      await db.mediaAsset.create({
        data: {
          kind: "IMAGE",

          provider:
            serverEnv().MEDIA_PROVIDER ===
            "s3"
              ? "S3"
              : "LOCAL",

          bucket:
            thumbnailObject.bucket ??
            serverEnv().STORAGE_BUCKET ??
            null,

          objectKey:
            thumbnailObject.objectKey ??
            thumbnailKey,

          url:
            thumbnailObject.url ??
            null,

          mimeType:
            THUMBNAIL_CONTENT_TYPE,

          sizeBytes:
            thumbnailObject.sizeBytes ??
            null,

          uploadedById:
            null,
        },

        select: {
          id: true,
        },
      });

    /*
     * -------------------------------------------------
     * 2. HOVER PREVIEW
     * -------------------------------------------------
     */

    if (output.previewPath) {
      const previewKey =
        storagePaths.preview(
          job.contentId,
        );

      await store.putFile(
        previewKey,
        output.previewPath,
        PREVIEW_CONTENT_TYPE,
      );

      console.info(
        `[worker] preview uploaded content=${job.contentId} key=${previewKey}`,
      );
    } else {
      console.warn(
        `[worker] preview unavailable content=${job.contentId}`,
      );
    }

    /*
     * -------------------------------------------------
     * 3. HLS RENDITIONS
     * -------------------------------------------------
     */

    for (
      const rendition of output.renditions
    ) {
      await uploadRendition(
        store,
        job.contentId,
        rendition.label,
        rendition.localDir,
      );
    }

    /*
     * -------------------------------------------------
     * 4. MASTER PLAYLIST
     * -------------------------------------------------
     */

    const masterKey =
      storagePaths.hlsMaster(
        job.contentId,
      );

    await store.putBuffer(
      masterKey,
      await readFile(
        output.masterPlaylistPath,
      ),
      PLAYLIST_CONTENT_TYPE,
    );

    /*
     * -------------------------------------------------
     * 5. DATABASE
     * -------------------------------------------------
     */

    await db.$transaction([
      db.videoRendition.deleteMany({
        where: {
          contentId: job.contentId,
        },
      }),

      db.videoRendition.createMany({
        data:
          output.renditions.map(
            (rendition) => ({
              contentId:
                job.contentId,

              label:
                rendition.label,

              width:
                rendition.width,

              height:
                rendition.height,

              bitrateKbps:
                rendition.bitrateKbps,

              playlistKey:
                rendition.playlistKey,

              sizeBytes:
                rendition.sizeBytes,
            }),
          ),
      }),

      db.content.update({
        where: {
          id: job.contentId,
        },

        data: {
          thumbnailId:
            thumbnailAsset.id,

          processingStatus:
            "READY",

          processingCompletedAt:
            new Date(),

          processingError:
            null,

          hlsMasterKey:
            masterKey,

          durationSeconds:
            output.media.durationSeconds,
        },
      }),
    ]);

    await markJobSucceeded(
      job.id,
    );

    console.info(
      `[worker] processing completed content=${job.contentId} renditions=${output.renditions.length} preview=${Boolean(output.previewPath)} thumbnail=true`,
    );

    return "succeeded";
  } catch (error) {
    const message =
      safeMessage(error);

    console.error(
      `[worker] processing failed content=${job.contentId}: ${message}`,
    );

    const { willRetry } =
      await markJobFailed(
        job.id,
        message,
        isRetryable(error),
      );

    return willRetry
      ? "retrying"
      : "failed";
  } finally {
    await cleanupWorkDir(
      workDir,
    );
  }
}

export async function runWorker(
  signal?: AbortSignal,
): Promise<void> {
  const env = serverEnv();

  const workerId =
    `worker-${process.pid}-${Date.now().toString(36)}`;

  console.info(
    `[worker] ${workerId} started, polling every ${env.WORKER_POLL_INTERVAL_MS}ms`,
  );

  while (!signal?.aborted) {
    try {
      const reclaimed =
        await reclaimStalledJobs();

      if (reclaimed > 0) {
        console.warn(
          `[worker] requeued ${reclaimed} stalled job(s)`,
        );
      }

      const outcome =
        await runOneJob(workerId);

      if (outcome === "idle") {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              env.WORKER_POLL_INTERVAL_MS,
            ),
        );
      }
    } catch (error) {
      console.error(
        "[worker] poll failed:",
        error,
      );

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            env.WORKER_POLL_INTERVAL_MS,
          ),
      );
    }
  }
}