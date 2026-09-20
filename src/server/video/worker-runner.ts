import "server-only";

import {
  copyFile,
  mkdir,
  readdir,
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

import {
  getConfiguredMediaProvider,
  getMediaProviderForAsset,
} from "@/server/services/storage-service";

import { storagePaths } from "@/lib/media/paths";

import type { StoredObject } from "@/lib/media/types";

/**
 * Video processing worker.
 *
 * Processing order:
 *
 * 1. Read original source from storage
 * 2. Probe/validate source
 * 3. Generate thumbnail
 * 4. Generate browser-compatible HLS
 * 5. Upload generated HLS files
 * 6. Save HLS metadata
 * 7. Mark content READY
 *
 * IMPORTANT:
 *
 * The original uploaded video is NEVER modified or replaced.
 *
 * The worker only downloads the original to a temporary
 * working directory, processes that temporary copy, and
 * uploads generated playback assets separately.
 */

const THUMBNAIL_CONTENT_TYPE =
  "image/webp";

const HLS_PLAYLIST_CONTENT_TYPE =
  "application/vnd.apple.mpegurl";

const HLS_SEGMENT_CONTENT_TYPE =
  "video/mp2t";

/**
 * Storage failures can be retried.
 *
 * Invalid FFmpeg input is treated as permanent because
 * retrying the same invalid source will not fix it.
 */
function isRetryable(
  error: unknown,
): boolean {
  if (
    error instanceof FfmpegError
  ) {
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

  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return "Unknown processing error.";
}

type S3DownloadCapable = {
  downloadToFile: (
    object: {
      bucket?: string | null;
      objectKey: string;
    },
    filePath: string,
  ) => Promise<void>;
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

/**
 * Always use the currently configured active provider
 * for generated playback assets.
 *
 * Railway ENV / active S3 configuration is the source
 * of truth for new generated objects.
 */
async function uploader(): Promise<Uploader> {
  return (
    await getConfiguredMediaProvider()
  ) as unknown as Uploader;
}

/**
 * Upload the generated HLS files.
 *
 * Order:
 *
 * 1. Upload all segments
 * 2. Upload rendition playlist
 * 3. Upload master playlist
 *
 * This ensures playlists are not published before
 * the files they reference exist in storage.
 */
async function uploadHlsOutput(
  store: Uploader,
  output: Awaited<
    ReturnType<typeof processVideo>
  >,
): Promise<string> {
  if (
    !output.masterPlaylistPath ||
    output.renditions.length === 0
  ) {
    throw new FfmpegError(
      "HLS output is incomplete.",
      "Missing master playlist or rendition.",
    );
  }

  for (
    const rendition of output.renditions
  ) {
    const files =
      await readdir(
        rendition.localDir,
      );

    const segmentFiles =
      files
        .filter(
          (file) =>
            file
              .toLowerCase()
              .endsWith(".ts"),
        )
        .sort();

    if (
      segmentFiles.length === 0
    ) {
      throw new FfmpegError(
        "HLS rendition contains no segments.",
        rendition.localDir,
      );
    }

    /*
     * Upload all segments first.
     */
    for (
      const file of segmentFiles
    ) {
      const localPath =
        path.join(
          rendition.localDir,
          file,
        );

      /*
       * Example playlist key:
       *
       * videos/hls/<contentId>/original/playlist.m3u8
       *
       * Segment becomes:
       *
       * videos/hls/<contentId>/original/segment-0000.ts
       */
      const renditionDirectory =
        path.posix.dirname(
          rendition.playlistKey,
        );

      const segmentKey =
        path.posix.join(
          renditionDirectory,
          file,
        );

      await store.putFile(
        segmentKey,
        localPath,
        HLS_SEGMENT_CONTENT_TYPE,
      );
    }

    /*
     * Verify rendition playlist exists.
     */
    const playlistPath =
      path.join(
        rendition.localDir,
        "playlist.m3u8",
      );

    const playlistExists =
      await stat(
        playlistPath,
      ).catch(
        () => null,
      );

    if (
      !playlistExists ||
      playlistExists.size <= 0
    ) {
      throw new FfmpegError(
        "HLS rendition playlist was not created.",
        playlistPath,
      );
    }

    /*
     * Upload rendition playlist after
     * its segments exist.
     */
    await store.putFile(
      rendition.playlistKey,
      playlistPath,
      HLS_PLAYLIST_CONTENT_TYPE,
    );

    console.info(
      `[worker] HLS rendition uploaded content=${rendition.playlistKey} segments=${segmentFiles.length}`,
    );
  }

  /*
   * Build master playlist storage key.
   *
   * Rendition:
   * videos/hls/<contentId>/original/playlist.m3u8
   *
   * Master:
   * videos/hls/<contentId>/master.m3u8
   */
  const firstRendition =
    output.renditions[0];

  if (
    !firstRendition
  ) {
    throw new FfmpegError(
      "No HLS rendition was generated.",
      "Missing first rendition.",
    );
  }

  const renditionDirectory =
    path.posix.dirname(
      firstRendition.playlistKey,
    );

  const hlsDirectory =
    path.posix.dirname(
      renditionDirectory,
    );

  const masterKey =
    path.posix.join(
      hlsDirectory,
      "master.m3u8",
    );

  /*
   * Verify local master playlist.
   */
  const masterExists =
    await stat(
      output.masterPlaylistPath,
    ).catch(
      () => null,
    );

  if (
    !masterExists ||
    masterExists.size <= 0
  ) {
    throw new FfmpegError(
      "HLS master playlist was not created.",
      output.masterPlaylistPath,
    );
  }

  /*
   * Upload master last.
   */
  await store.putFile(
    masterKey,
    output.masterPlaylistPath,
    HLS_PLAYLIST_CONTENT_TYPE,
  );

  console.info(
    `[worker] HLS master uploaded key=${masterKey}`,
  );

  return masterKey;
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
     * -------------------------------------------------
     * 1. MARK PROCESSING
     * -------------------------------------------------
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
     * -------------------------------------------------
     * 2. FIND ORIGINAL SOURCE
     * -------------------------------------------------
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
     * -------------------------------------------------
     * 3. DOWNLOAD ORIGINAL TO TEMPORARY STORAGE
     * -------------------------------------------------
     *
     * The original storage object is never modified.
     */
    await mkdir(
      workDir,
      {
        recursive: true,
      },
    );

    const extension =
      path.extname(
        sourceKey,
      ) || ".bin";

    const localSource =
      path.join(
        workDir,
        `source${extension}`,
      );

    if (
      content?.source?.provider ===
      "S3"
    ) {
      /*
       * Use the provider belonging to
       * the existing source object.
       */
      const sourceProvider =
        await getMediaProviderForAsset(
          content.source,
        );

      const downloadToFile =
        (
          sourceProvider as unknown as
            S3DownloadCapable
        ).downloadToFile;

      if (
        !downloadToFile
      ) {
        throw new Error(
          "The configured S3 storage cannot download source files.",
        );
      }

      await mkdir(
        path.dirname(
          localSource,
        ),
        {
          recursive: true,
        },
      );

      await downloadToFile.call(
        sourceProvider,
        {
          bucket:
            content.source.bucket,

          objectKey:
            sourceKey,
        },
        localSource,
      );
    } else {
      /*
       * LOCAL storage compatibility.
       */
      const localStoredSource =
        path.join(
          env.MEDIA_LOCAL_ROOT,
          sourceKey,
        );

      await stat(
        localStoredSource,
      ).catch(
        () => {
          throw new FfmpegError(
            "The source file could not be found in storage.",
            sourceKey,
          );
        },
      );

      await copyFile(
        localStoredSource,
        localSource,
      );
    }

    console.info(
      `[worker] source downloaded content=${job.contentId} file=${path.basename(localSource)}`,
    );

    /*
     * -------------------------------------------------
     * 4. FFMPEG PROCESSING
     * -------------------------------------------------
     *
     * processVideo() works only on the temporary copy.
     *
     * It generates:
     *
     * - thumbnail.webp
     * - HLS rendition
     * - HLS segments
     * - HLS master playlist
     */
    const output =
      await processVideo(
        localSource,
        workDir,
        job.contentId,
      );

    /*
     * -------------------------------------------------
     * 5. STORAGE PROVIDER
     * -------------------------------------------------
     *
     * Generated assets always go to the
     * currently configured storage provider.
     */
    const store =
      await uploader();

    /*
     * -------------------------------------------------
     * 6. THUMBNAIL
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

    const thumbnailAsset =
      await db.mediaAsset.create({
        data: {
          kind:
            "IMAGE",

          provider:
            thumbnailObject.provider,

          bucket:
            thumbnailObject.bucket ??
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

    console.info(
      `[worker] thumbnail uploaded content=${job.contentId} key=${thumbnailKey}`,
    );

    /*
     * -------------------------------------------------
     * 7. HLS PLAYBACK
     * -------------------------------------------------
     *
     * HLS is now the common playback format for
     * ALL supported input formats.
     *
     * The original uploaded file stays untouched.
     */
    let hlsMasterKey:
      string | null = null;

    if (
      output.masterPlaylistPath &&
      output.renditions.length > 0
    ) {
      hlsMasterKey =
        await uploadHlsOutput(
          store,
          output,
        );
    }

    /*
     * HLS MUST exist for this pipeline.
     *
     * Do not mark a video READY if no playback
     * playlist was generated.
     */
    if (
      !hlsMasterKey
    ) {
      throw new FfmpegError(
        "Video processing completed without a playable HLS output.",
        "master.m3u8 was not generated.",
      );
    }

    /*
     * -------------------------------------------------
     * 8. DATABASE
     * -------------------------------------------------
     *
     * Save rendition metadata only after every
     * generated HLS object has been uploaded.
     */
    const renditionRows =
      output.renditions.map(
        (
          rendition,
        ) => ({
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
      );

    await db.$transaction(
      async (tx) => {
        /*
         * Remove stale rendition rows from
         * older processing attempts.
         */
        await tx.videoRendition.deleteMany(
          {
            where: {
              contentId:
                job.contentId,
            },
          },
        );

        /*
         * Create fresh rendition rows.
         */
        if (
          renditionRows.length > 0
        ) {
          await tx.videoRendition.createMany(
            {
              data:
                renditionRows,
            },
          );
        }

        /*
         * Mark READY only after:
         *
         * - source downloaded
         * - FFmpeg completed
         * - thumbnail uploaded
         * - HLS segments uploaded
         * - rendition playlist uploaded
         * - master playlist uploaded
         */
        await tx.content.update({
          where: {
            id:
              job.contentId,
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

            hlsMasterKey,

            durationSeconds:
              output.media
                .durationSeconds,
          },
        });
      },
    );

    await markJobSucceeded(
      job.id,
    );

    console.info(
      `[worker] processing completed content=${job.contentId} thumbnail=true hls=true original-preserved=true`,
    );

    return "succeeded";
  } catch (error) {
    const message =
      safeMessage(
        error,
      );

    console.error(
      `[worker] processing failed content=${job.contentId}: ${message}`,
    );

    const {
      willRetry,
    } =
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
     * Delete ONLY the temporary FFmpeg work directory.
     *
     * Never delete:
     *
     * - original R2 source
     * - generated HLS objects
     * - thumbnail objects
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

      if (
        reclaimed > 0
      ) {
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
          (
            resolve,
          ) =>
            setTimeout(
              resolve,
              env.WORKER_POLL_INTERVAL_MS,
            ),
        );
      }
    } catch (error) {
      /*
       * Never allow one polling error
       * to kill the worker.
       */
      console.error(
        "[worker] poll failed:",
        error,
      );

      await new Promise(
        (
          resolve,
        ) =>
          setTimeout(
            resolve,
            env.WORKER_POLL_INTERVAL_MS,
          ),
      );
    }
  }
}