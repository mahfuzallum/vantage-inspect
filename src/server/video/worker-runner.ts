import "server-only";

import { copyFile, mkdir, stat } from "node:fs/promises";

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

import { getConfiguredMediaProvider, getMediaProviderForAsset } from "@/server/services/storage-service";
import { storagePaths } from "@/lib/media/paths";
import type { StoredObject } from "@/lib/media/types";

/**
 * Video processing worker.
 *
 * Processing order:
 *
 * 1. Read original source
 * 2. Generate thumbnail
 * 3. Upload thumbnail
 * 4. Mark content READY
 *
 * A recording is never marked READY before
 * all required media assets are available.
 */

const THUMBNAIL_CONTENT_TYPE =
  "image/webp";

/**
 * Storage failures can be retried.
 * Invalid FFmpeg input should not be retried.
 */
function isRetryable(
  error: unknown,
): boolean {
  if (error instanceof FfmpegError) {
    return false;
  }

  return true;
}

function safeMessage(
  error: unknown,
): string {
  if (
    error instanceof FfmpegError
  ) {
    return `${error.message}: ${error.detail}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown processing error.";
}

type S3DownloadCapable = {
  downloadToFile: (object: { bucket?: string | null; objectKey: string }, filePath: string) => Promise<void>;
};

type Uploader = {
  putFile(
    key: string,
    filePath: string,
    contentType: string,
  ): Promise<StoredObject>;

  putBuffer(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StoredObject>;
};

async function uploader(): Promise<Uploader> {
  return (await getConfiguredMediaProvider()) as unknown as Uploader;
}

/**
 * Upload one HLS rendition.
 *
 * Segments are uploaded before the playlist.
 */
export type JobOutcome =
  | "succeeded"
  | "retrying"
  | "failed"
  | "idle";

/**
 * Run one queued video-processing job.
 */
export async function runOneJob(
  workerId: string,
): Promise<JobOutcome> {
  const job =
    await claimNextJob(
      workerId,
    );

  if (!job) {
    return "idle";
  }

  const env =
    serverEnv();

  const workDir =
    path.join(
      env.VIDEO_WORK_DIR,
      job.contentId,
    );

  console.info(
    `[worker] processing started content=${job.contentId} attempt=${job.attempts}`,
  );

  try {
    /*
     * Mark processing.
     */
    await db.content.update({
      where: {
        id: job.contentId,
      },

      data: {
        processingStatus:
          "PROCESSING",

        processingStartedAt:
          new Date(),

        processingAttempts:
          job.attempts,

        processingError:
          null,
      },
    });

    /*
     * Find original source.
     */
    const content =
      await db.content.findUnique({
        where: {
          id: job.contentId,
        },

        select: {
          id: true,

          source: {
            select: {
              objectKey: true,
              provider: true,
              bucket: true,
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

    /*
     * Resolve the source from its original storage backend. S3-compatible
     * sources are downloaded to the local FFmpeg scratch area first.
     */
    await mkdir(workDir, { recursive: true });
    const extension = path.extname(sourceKey) || ".bin";
    const localSource = path.join(workDir, `source${extension}`);
    if (content?.source?.provider === "S3") {
      const sourceProvider = await getMediaProviderForAsset(content.source);
      const downloadToFile = (sourceProvider as unknown as S3DownloadCapable).downloadToFile;
      if (!downloadToFile) {
        throw new Error("The configured S3 storage cannot download source files.");
      }
      await mkdir(path.dirname(localSource), { recursive: true });
      await downloadToFile.call(sourceProvider, { bucket: content.source.bucket, objectKey: sourceKey }, localSource);
    } else {
      const localStoredSource = path.join(env.MEDIA_LOCAL_ROOT, sourceKey);
      await stat(localStoredSource).catch(() => {
        throw new FfmpegError(
          "The source file could not be found in storage.",
          sourceKey,
        );
      });
      await copyFile(localStoredSource, localSource);
    }

    /*
     * FFmpeg processing.
     *
     * IMPORTANT:
     *
     * processVideo() now returns:
     *
     * - thumbnailPath
     * - no playback transcode
     */
    const output =
      await processVideo(
        localSource,
        workDir,
        job.contentId,
      );

    const store =
      await uploader();

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

    /*
     * The thumbnail bytes are useful only if Content points at the generated
     * MediaAsset. Without this row the mapper returns thumbnailUrl=null even
     * though the file exists in storage.
     */
    const thumbnailAsset =
      await db.mediaAsset.create({
        data: {
          kind: "IMAGE",
          provider: thumbnailObject.provider,
          bucket: thumbnailObject.bucket ?? null,
          objectKey: thumbnailObject.objectKey ?? thumbnailKey,
          url: thumbnailObject.url ?? null,
          mimeType: THUMBNAIL_CONTENT_TYPE,
          sizeBytes: thumbnailObject.sizeBytes ?? null,
          uploadedById: null,
        },
        select: { id: true },
      });

    console.info(
      `[worker] thumbnail uploaded content=${job.contentId} key=${thumbnailKey}`,
    );

    /* Original file is the playback asset; no HLS/preview generation. */

    /*
     * -------------------------------------------------
     * 5. DATABASE
     * -------------------------------------------------
     *
     * Only after all storage operations
     * succeed do we mark the video READY.
     */
    await db.$transaction([
      db.videoRendition.deleteMany({ where: { contentId: job.contentId } }),
      db.content.update({
        where: { id: job.contentId },
        data: {
          thumbnailId: thumbnailAsset.id,
          processingStatus: "READY",
          processingCompletedAt: new Date(),
          processingError: null,
          hlsMasterKey: null,
          durationSeconds: output.media.durationSeconds,
        },
      }),
    ]);

    await markJobSucceeded(job.id);
    console.info(`[worker] processing completed content=${job.contentId} thumbnail=true original-playback=true`);

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
    /*
     * Delete FFmpeg scratch files.
     *
     * Uploaded assets remain in storage.
     */
    await cleanupWorkDir(
      workDir,
    );
  }
}

/**
 * Long-running worker loop.
 */
export async function runWorker(
  signal?: AbortSignal,
): Promise<void> {
  const env =
    serverEnv();

  const workerId =
    `worker-${process.pid}-${Date.now().toString(36)}`;

  console.info(
    `[worker] ${workerId} started, polling every ${env.WORKER_POLL_INTERVAL_MS}ms`,
  );

  while (
    !signal?.aborted
  ) {
    try {
      const reclaimed =
        await reclaimStalledJobs();

      if (reclaimed > 0) {
        console.warn(
          `[worker] requeued ${reclaimed} stalled job(s)`,
        );
      }

      const outcome =
        await runOneJob(
          workerId,
        );

      if (
        outcome === "idle"
      ) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              env.WORKER_POLL_INTERVAL_MS,
            ),
        );
      }
    } catch (error) {
      /*
       * Never allow one poll error
       * to kill the worker.
       */
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