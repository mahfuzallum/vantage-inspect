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

import {
  declaredBandwidth,
  selectLadder,
  widthFor,
  type Rung,
} from "./ladder";

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

/**
 * Keep FFmpeg from consuming the entire machine.
 *
 * This is especially important because the Next.js server,
 * database and media-serving requests run on the same machine.
 *
 * Two encoder threads gives FFmpeg enough performance while leaving
 * CPU capacity available for the website and video playback.
 */
const FFMPEG_THREADS = 2;
const FFMPEG_FILTER_THREADS = 1;

const SEGMENT_SECONDS = 6;

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

/**
 * FFmpeg options shared by all processing operations.
 */
function ffmpegResourceArgs(): string[] {
  return [
    "-threads",
    String(FFMPEG_THREADS),

    "-filter_threads",
    String(FFMPEG_FILTER_THREADS),

    "-filter_complex_threads",
    String(FFMPEG_FILTER_THREADS),
  ];
}

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

    ...ffmpegResourceArgs(),

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

      ...ffmpegResourceArgs(),

      "-ss",
      at.toFixed(2),

      "-t",
      previewDuration.toFixed(2),

      "-i",
      sourcePath,

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
 * Generate one HLS rendition.
 */
export async function generateRendition(
  sourcePath: string,
  workDir: string,
  videoId: string,
  rung: Rung,
  source: ProbedMedia,
): Promise<RenditionResult> {
  const localDir =
    path.join(
      workDir,
      rung.label,
    );

  await mkdir(
    localDir,
    {
      recursive: true,
    },
  );

  const width =
    widthFor(
      source.width,
      source.height,
      rung.height,
    );

  const args = [
    "-y",

    ...ffmpegResourceArgs(),

    "-i",
    sourcePath,

    "-c:v",
    "libx264",

    /*
     * veryfast keeps CPU usage significantly lower than
     * slower x264 presets.
     */
    "-preset",
    "veryfast",

    "-profile:v",
    "main",

    "-crf",
    "21",

    "-sc_threshold",
    "0",

    /*
     * Fixed GOP aligned to HLS segments.
     */
    "-g",
    String(
      SEGMENT_SECONDS * 30,
    ),

    "-keyint_min",
    String(
      SEGMENT_SECONDS * 30,
    ),

    "-b:v",
    `${rung.bitrateKbps}k`,

    "-maxrate",
    `${rung.maxrateKbps}k`,

    "-bufsize",
    `${rung.bufsizeKbps}k`,

    "-vf",
    `scale=${width}:${rung.height}`,
  ];

  if (source.hasAudio) {
    args.push(
      "-c:a",
      "aac",

      "-b:a",
      `${rung.audioKbps}k`,

      "-ac",
      "2",
    );
  } else {
    args.push(
      "-an",
    );
  }

  args.push(
    "-f",
    "hls",

    "-hls_time",
    String(
      SEGMENT_SECONDS,
    ),

    "-hls_playlist_type",
    "vod",

    /*
     * MPEG-TS HLS segments.
     */
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

  await ffmpeg(
    args,
  );

  const files =
    await readdir(
      localDir,
    );

  let sizeBytes = 0;

  for (const file of files) {
    const filePath =
      path.join(
        localDir,
        file,
      );

    const fileStat =
      await stat(
        filePath,
      );

    if (fileStat.isFile()) {
      sizeBytes += fileStat.size;
    }
  }

  return {
    label:
      rung.label,

    width,

    height:
      rung.height,

    bitrateKbps:
      rung.bitrateKbps,

    localDir,

    playlistKey:
      storagePaths.hlsVariantPlaylist(
        videoId,
        rung.label,
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
      declaredBandwidth({
        label:
          rendition.label,

        height:
          rendition.height,

        bitrateKbps:
          rendition.bitrateKbps,

        audioKbps:
          128,

        maxrateKbps:
          0,

        bufsizeKbps:
          0,
      });

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
   *
   * FFprobe detects the actual container, so the source can be
   * MP4, MPEG-TS, MOV, WebM, MKV, etc.
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
   */
  const previewPath =
    await generatePreview(
      sourcePath,
      workDir,
      media.durationSeconds,
    );

  /*
   * 4. Generate HLS ladder.
   *
   * Renditions remain sequential intentionally.
   *
   * DO NOT use Promise.all() here.
   *
   * Running 1080p + 720p + 480p simultaneously would start
   * several x264 encoders at once and can make the website
   * unresponsive on the same machine.
   */
  const rungs =
    selectLadder(
      media.height,
    );

  const renditions:
    RenditionResult[] = [];

  for (const rung of rungs) {
    renditions.push(
      await generateRendition(
        sourcePath,
        workDir,
        videoId,
        rung,
        media,
      ),
    );
  }

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