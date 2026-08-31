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
import type { StoredObject } from "@/lib/media/types";

/**
 * Video processing worker.
 *
 * Processing order:
 *
 * 1. Read original source
 * 2. Generate thumbnail
 * 3. Generate animated hover preview
 * 4. Package original video as HLS (no re-encoding)
 * 5. Upload all assets
 * 6. Mark content READY
 *
 * A recording is never marked READY before
 * all required media assets are available.
 */

const SEGMENT_CONTENT_TYPE =
  "video/mp2t";

const PLAYLIST_CONTENT_TYPE =
  "application/vnd.apple.mpegurl";

const PREVIEW_CONTENT_TYPE =
  "image/webp";

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

function uploader(): Uploader {
  return serverEnv()
    .MEDIA_PROVIDER === "s3"
    ? (new S3MediaProvider() as unknown as Uploader)
    : (new LocalMediaProvider() as unknown as Uploader);
}

/**
 * Upload one HLS rendition.
 *
 * Segments are uploaded before the playlist.
 */
async function uploadRendition(
  store: Uploader,
  videoId: string,
  label: string,
  localDir: string,
): Promise<void> {
  const files =
    await readdir(localDir);

  /*
   * Upload media segments first.
   */
  for (
    const file of files.filter(
      (name) =>
        name.endsWith(".ts"),
    )
  ) {
    await store.putFile(
      `${storagePaths.hlsVariantDir(
        videoId,
        label,
      )}/${file}`,
      path.join(
        localDir,
        file,
      ),
      SEGMENT_CONTENT_TYPE,
    );
  }

  /*
   * Playlist goes after all segments.
   */
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
     * Local storage source.
     */
    const localSource =
      path.join(
        env.MEDIA_LOCAL_ROOT,
        sourceKey,
      );

    await stat(
      localSource,
    ).catch(() => {
      throw new FfmpegError(
        "The source file could not be found in storage.",
        sourceKey,
      );
    });

    /*
     * Prepare worker directory.
     */
    await mkdir(
      workDir,
      {
        recursive: true,
      },
    );

    /*
     * FFmpeg processing.
     *
     * IMPORTANT:
     *
     * processVideo() now returns:
     *
     * - thumbnailPath
     * - previewPath
     * - renditions
     * - masterPlaylistPath
     */
    const output =
      await processVideo(
        localSource,
        workDir,
        job.contentId,
      );

    const store =
      uploader();

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

    /*
     * -------------------------------------------------
     * 2. HOVER PREVIEW
     * -------------------------------------------------
     *
     * This was previously missing.
     *
     * processor.ts generates:
     *
     * workDir/preview.webp
     *
     * Now we actually upload it.
     */
    if (output.previewPath) {
      await store.putFile(
        storagePaths.preview(
          job.contentId,
        ),
        output.previewPath,
        PREVIEW_CONTENT_TYPE,
      );

      console.info(
        `[worker] preview uploaded content=${job.contentId}`,
      );
    } else {
      /*
       * Preview generation is optional.
       * The actual video can still become READY.
       */
      console.warn(
        `[worker] preview unavailable content=${job.contentId}`,
      );
    }

    /*
     * -------------------------------------------------
     * 3. ORIGINAL-QUALITY HLS
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
     *
     * Master is uploaded last.
     */
    await store.putBuffer(
      storagePaths.hlsMaster(
        job.contentId,
      ),
      await readFile(
        output.masterPlaylistPath,
      ),
      PLAYLIST_CONTENT_TYPE,
    );

    /*
     * -------------------------------------------------
     * 5. DATABASE
     * -------------------------------------------------
     *
     * Only after all storage operations
     * succeed do we mark the video READY.
     */
    await db.$transaction([
      db.videoRendition.deleteMany({
        where: {
          contentId:
            job.contentId,
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
            storagePaths.hlsMaster(
              job.contentId,
            ),

          durationSeconds:
            output.media
              .durationSeconds,
        },
      }),
    ]);

    /*
     * Job completed.
     */
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