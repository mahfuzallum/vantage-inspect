import "server-only";

import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

import {
  ffmpeg,
  FfmpegError,
  probe,
  validateProbed,
  type ProbedMedia,
} from "./ffmpeg";

import { storagePaths } from "@/lib/media/paths";

/**
 * VideoProcessingService
 *
 * All FFmpeg work for one recording happens here.
 *
 * Pipeline:
 *
 * source video
 *   ↓
 * probe
 *   ↓
 * thumbnail
 *   ↓
 * animated hover preview
 *   ↓
 * HLS renditions
 *   ↓
 * master playlist
 *
 * Everything is generated inside the worker's
 * temporary directory first.
 */

export type RenditionResult = {
  label: string;
  width: number;
  height: number;
  bitrateKbps: number;

  /** Local directory containing playlist.m3u8 + segments. */
  localDir: string;

  playlistKey: string;

  sizeBytes: number;
};

export type ProcessingOutput = {
  media: ProbedMedia;

  thumbnailPath: string;

  /**
   * Animated WebP hover preview.
   *
   * Null means preview generation failed.
   * Preview failure does not fail the whole video.
   */
  previewPath: string | null;

  masterPlaylistPath: string;

  renditions: RenditionResult[];
};

const SEGMENT_SECONDS = 6;

/**
 * Picks a useful frame for thumbnail/preview.
 *
 * Many webcam recordings contain 1-2 seconds of
 * black/loading content before the actual video starts.
 *
 * We therefore prefer a frame after the startup period.
 */
export function thumbnailTimestamp(
  durationSeconds: number,
): number {
  /*
   * Extremely short video.
   */
  if (durationSeconds <= 1) {
    return Math.max(
      0,
      durationSeconds / 2,
    );
  }

  /*
   * Short video.
   *
   * Use a point closer to the middle/end so we
   * avoid the initial startup frame.
   */
  if (durationSeconds <= 4) {
    return Math.min(
      durationSeconds * 0.75,
      Math.max(
        0.5,
        durationSeconds / 2,
      ),
    );
  }

  /*
   * Normal video.
   *
   * Prefer 2.5 seconds because many webcam videos
   * have 1-2 seconds of startup/blank content.
   *
   * Also keep the old 10% behaviour for longer videos.
   */
  return Math.min(
    60,
    Math.max(
      2.5,
      durationSeconds * 0.1,
    ),
  );
}

/**
 * Generate a reliable still thumbnail.
 *
 * Thumbnail generation tries multiple timestamps.
 *
 * This is important for webcam recordings where:
 *
 * 0.0s  -> black/loading
 * 1.0s  -> black/loading
 * 2.0s  -> video begins
 *
 * Instead of relying on one frame, FFmpeg tries
 * several safe positions automatically.
 */
export async function generateThumbnail(
  sourcePath: string,
  workDir: string,
  durationSeconds: number,
): Promise<string> {
  const output = path.join(
    workDir,
    "thumbnail.webp",
  );

  /*
   * Generate a list of possible timestamps.
   *
   * The first positions specifically handle
   * videos that start 1-2 seconds late.
   */
  const candidates = Array.from(
    new Set(
      [
        thumbnailTimestamp(
          durationSeconds,
        ),

        1.5,
        2.5,
        5,

        durationSeconds * 0.25,
        durationSeconds * 0.5,
        durationSeconds * 0.75,
      ]
        .filter(
          (value) =>
            Number.isFinite(value) &&
            value >= 0 &&
            value < durationSeconds,
        )
        .map(
          (value) =>
            Math.max(
              0,
              Math.min(
                value,
                Math.max(
                  0,
                  durationSeconds - 0.1,
                ),
              ),
            ),
        ),
    ),
  );

  let lastError: unknown = null;

  for (const at of candidates) {
    try {
      /*
       * Remove the previous output before every attempt.
       *
       * This prevents an old thumbnail from being
       * accidentally accepted when a later FFmpeg
       * attempt fails.
       */
      await rm(
        output,
        {
          force: true,
        },
      ).catch(
        () => undefined,
      );

      /*
       * Open the input first and seek afterwards.
       *
       * This is more reliable for webcam/container
       * files with unusual timestamps.
       */
      await ffmpeg([
        "-y",

        "-i",
        sourcePath,

        "-ss",
        at.toFixed(2),

        "-frames:v",
        "1",

        /*
         * Keep the original aspect ratio.
         *
         * Maximum width is 1280px.
         */
        "-vf",
        "scale='min(1280,iw)':-2:flags=lanczos",

        "-c:v",
        "libwebp",

        "-quality",
        "82",

        "-compression_level",
        "6",

        output,
      ]);

      /*
       * FFmpeg can occasionally exit successfully
       * without producing a usable output.
       *
       * Verify that the generated thumbnail actually
       * exists and contains bytes.
       */
      const generated =
        await stat(
          output,
        ).catch(
          () => null,
        );

      if (
        generated &&
        generated.size > 0
      ) {
        console.info(
          `[processor] thumbnail generated at ${at.toFixed(2)}s`,
        );

        return output;
      }
    } catch (error) {
      lastError = error;

      console.warn(
        `[processor] thumbnail attempt failed at ${at.toFixed(2)}s`,
      );
    }
  }

  /*
   * All thumbnail attempts failed.
   *
   * Do not silently continue with a missing thumbnail,
   * because the worker expects thumbnailPath to exist.
   */
  throw new FfmpegError(
    "Unable to generate a video thumbnail.",
    lastError instanceof Error
      ? lastError.message
      : "No usable video frame was found.",
  );
}

/**
 * Generate an animated WebP hover preview.
 *
 * This is intentionally small:
 *
 * - 3 seconds
 * - 10 FPS
 * - 480px width
 *
 * It is designed for archive-card hover,
 * not full video playback.
 */
export async function generatePreview(
  sourcePath: string,
  workDir: string,
  durationSeconds: number,
): Promise<string | null> {
  const output = path.join(
    workDir,
    "preview.webp",
  );

  const at =
    thumbnailTimestamp(
      durationSeconds,
    );

  /*
   * Do not try to generate a 3-second
   * preview if the video is extremely short.
   */
  const previewDuration =
    Math.min(
      3,
      Math.max(
        0.5,
        durationSeconds - at,
      ),
    );

  try {
    await ffmpeg([
      "-y",

      "-ss",
      at.toFixed(2),

      "-t",
      previewDuration.toFixed(2),

      "-i",
      sourcePath,

      /*
       * 10 frames/sec is enough for a
       * smooth hover preview while keeping
       * the generated WebP relatively small.
       */
      "-vf",
      "fps=10,scale=480:-2:flags=lanczos",

      "-c:v",
      "libwebp",

      "-loop",
      "0",

      "-quality",
      "60",

      output,
    ]);

    return output;
  } catch (error) {
    /*
     * Preview generation is optional.
     *
     * If FFmpeg cannot create it, the
     * actual video must still continue
     * through the normal processing pipeline.
     */
    console.warn(
      `[processor] hover preview generation failed: ${
        error instanceof Error
          ? error.message
          : "unknown error"
      }`,
    );

    return null;
  }
}

/**
 * Generate a browser-compatible HLS rendition.
 *
 * IMPORTANT:
 *
 * The uploaded video's original codec is NOT copied directly.
 *
 * Video is encoded as:
 * - H.264
 * - yuv420p
 *
 * Audio is encoded as:
 * - AAC
 *
 * This makes the generated HLS stream compatible with
 * normal browser HTML5/HLS playback.
 */
export async function generateRendition(
  sourcePath: string,
  workDir: string,
  videoId: string,
  source: ProbedMedia,
): Promise<RenditionResult> {
  const label = "original";
  const localDir = path.join(workDir, label);

  await mkdir(localDir, { recursive: true });

  /*
   * H.264 requires dimensions compatible with
   * the selected pixel format.
   *
   * Force both dimensions to even values while
   * preserving the original aspect ratio.
   */
  const outputWidth =
    Math.max(
      2,
      Math.floor(source.width / 2) * 2,
    );

  const outputHeight =
    Math.max(
      2,
      Math.floor(source.height / 2) * 2,
    );

  const args = [
    "-y",

    "-i",
    sourcePath,

    "-map",
    "0:v:0",
  ];

  if (source.hasAudio) {
    args.push(
      "-map",
      "0:a:0?",
    );
  }

  /*
   * Browser-compatible video encoding.
   *
   * veryfast keeps CPU usage reasonable while
   * still producing a good quality H.264 stream.
   */
  args.push(
    "-vf",
    `scale=${outputWidth}:${outputHeight}:flags=lanczos`,

    "-c:v",
    "libx264",

    "-preset",
    "veryfast",

    "-crf",
    "23",

    "-pix_fmt",
    "yuv420p",

    /*
     * Keep keyframes aligned with HLS segments.
     * This makes seeking and segment switching
     * more reliable.
     */
    "-force_key_frames",
    `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,

    "-sc_threshold",
    "0",
  );

  if (source.hasAudio) {
    args.push(
      "-c:a",
      "aac",

      "-b:a",
      "128k",

      "-ar",
      "48000",
    );
  } else {
    args.push("-an");
  }

  args.push(
    "-f",
    "hls",

    "-hls_time",
    String(SEGMENT_SECONDS),

    "-hls_playlist_type",
    "vod",

    "-hls_flags",
    "independent_segments",

    "-hls_segment_filename",
    path.join(
      localDir,
      "segment-%04d.ts",
    ),

    path.join(
      localDir,
      "playlist.m3u8",
    ),
  );

  await ffmpeg(args);

  const files =
    await readdir(
      localDir,
    );

  let sizeBytes = 0;

  for (const file of files) {
    sizeBytes += (
      await stat(
        path.join(
          localDir,
          file,
        ),
      )
    ).size;
  }

  /*
   * The actual bitrate is no longer the original
   * source bitrate because the video was re-encoded.
   *
   * Estimate a useful master-playlist bandwidth
   * from the source bitrate when available.
   */
  const bitrateKbps =
    Math.max(
      256,
      Math.round(
        (source.bitrate ?? 1_000_000) / 1000,
      ),
    );

  return {
    label,

    width: outputWidth,

    height: outputHeight,

    bitrateKbps,

    localDir,

    playlistKey:
      storagePaths.hlsVariantPlaylist(
        videoId,
        label,
      ),

    sizeBytes,
  };
}

/**
 * Write the HLS master playlist.
 */
export async function writeMasterPlaylist(
  workDir: string,
  renditions: RenditionResult[],
): Promise<string> {
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
  ];

  const ordered =
    [...renditions].sort(
      (a, b) =>
        a.height - b.height,
    );

  for (const rendition of ordered) {
    const bandwidth =
      Math.max(
        1,
        rendition.bitrateKbps * 1000,
      );

    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${rendition.width}x${rendition.height},NAME="${rendition.label}"`,

      `${rendition.label}/playlist.m3u8`,
    );
  }

  const output =
    path.join(
      workDir,
      "master.m3u8",
    );

  await writeFile(
    output,
    `${lines.join("\n")}\n`,
    "utf8",
  );

  return output;
}

/**
 * Full processing pipeline.
 */
export async function processVideo(
  sourcePath: string,
  workDir: string,
  videoId: string,
): Promise<ProcessingOutput> {
  await mkdir(
    workDir,
    {
      recursive: true,
    },
  );

  /*
   * 1. Probe original video.
   */
  const media =
    await probe(
      sourcePath,
    );

  const validation =
    validateProbed(
      media,
    );

  if (!validation.ok) {
    throw new FfmpegError(
      validation.reason,
      validation.reason,
    );
  }

  /*
   * 2. Generate thumbnail.
   *
   * This automatically tries multiple frames
   * when the beginning of the video is delayed.
   */
  const thumbnailPath =
    await generateThumbnail(
      sourcePath,
      workDir,
      media.durationSeconds,
    );

  /*
   * 3. Generate animated hover preview.
   *
   * IMPORTANT:
   *
   * This was missing before.
   *
   * generatePreview() existed but was never
   * called by processVideo().
   */
  const previewPath =
    await generatePreview(
      sourcePath,
      workDir,
      media.durationSeconds,
    );

  /*
   * 4. Generate browser-compatible HLS rendition.
   *
   * The original video is re-encoded to
   * H.264/AAC for reliable browser playback.
   */
  const renditions: RenditionResult[] = [
    await generateRendition(
      sourcePath,
      workDir,
      videoId,
      media,
    ),
  ];

  /*
   * 5. Write master playlist.
   */
  const masterPlaylistPath =
    await writeMasterPlaylist(
      workDir,
      renditions,
    );

  return {
    media,

    thumbnailPath,

    previewPath,

    masterPlaylistPath,

    renditions,
  };
}

/**
 * Best-effort scratch cleanup.
 */
export async function cleanupWorkDir(
  workDir: string,
): Promise<void> {
  await rm(
    workDir,
    {
      recursive: true,
      force: true,
    },
  ).catch(
    () => undefined,
  );
}

/**
 * Read a file when it exists.
 */
export async function readIfExists(
  filePath: string,
): Promise<Buffer | null> {
  try {
    return await readFile(
      filePath,
    );
  } catch {
    return null;
  }
}