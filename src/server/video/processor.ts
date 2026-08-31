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
 * Avoids the first frame because it is often:
 * - black
 * - a title card
 * - a loading screen
 */
export function thumbnailTimestamp(
  durationSeconds: number,
): number {
  if (durationSeconds <= 4) {
    return Math.max(
      0,
      durationSeconds / 2,
    );
  }

  return Math.min(
    60,
    Math.max(
      1,
      durationSeconds * 0.1,
    ),
  );
}

/**
 * Generate a still thumbnail.
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

  const at =
    thumbnailTimestamp(
      durationSeconds,
    );

  await ffmpeg([
    "-y",

    "-ss",
    at.toFixed(2),

    "-i",
    sourcePath,

    "-frames:v",
    "1",

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

  return output;
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
 * Package the ORIGINAL video as a single HLS rendition.
 *
 * IMPORTANT: this intentionally uses stream copy. The uploaded video is never
 * resized, re-encoded, or assigned a different bitrate. HLS only splits the
 * existing encoded streams into segments for playback.
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

  const args = [
    "-y",
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
  ];

  if (source.hasAudio) {
    args.push("-map", "0:a:0?");
  }

  args.push(
    "-c:v",
    "copy",
  );

  if (source.hasAudio) {
    args.push("-c:a", "copy");
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
    "-hls_segment_filename",
    path.join(localDir, "segment-%04d.ts"),
    path.join(localDir, "playlist.m3u8"),
  );

  await ffmpeg(args);

  const files = await readdir(localDir);
  let sizeBytes = 0;

  for (const file of files) {
    sizeBytes += (
      await stat(path.join(localDir, file))
    ).size;
  }

  return {
    label,
    width: source.width,
    height: source.height,
    bitrateKbps: Math.max(1, Math.round((source.bitrate ?? 0) / 1000)),
    localDir,
    playlistKey: storagePaths.hlsVariantPlaylist(videoId, label),
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
    const bandwidth = Math.max(1, rendition.bitrateKbps * 1000);

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
   * 4. Package the original encoded streams as one HLS rendition.
   *
   * No scaling, bitrate targeting, or codec conversion happens here.
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