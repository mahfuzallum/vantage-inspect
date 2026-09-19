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
 * IMPORTANT:
 *
 * The uploaded/original source file is NEVER modified.
 *
 * FFmpeg works only on a temporary local copy.
 *
 * Processing creates:
 *
 * 1. thumbnail.webp
 * 2. optional animated preview.webp
 * 3. browser-compatible HLS:
 *      original/
 *        playlist.m3u8
 *        segment-0000.ts
 *        segment-0001.ts
 *        ...
 * 4. master.m3u8
 *
 * The original uploaded file remains untouched in storage.
 */

export type RenditionResult = {
  label: string;
  width: number;
  height: number;
  bitrateKbps: number;

  /** Local directory containing playlist.m3u8 + segments. */
  localDir: string;

  /** Storage key for the rendition playlist. */
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
   */
  previewPath: string | null;

  /**
   * Local HLS master playlist.
   *
   * The original source file is NOT replaced.
   */
  masterPlaylistPath: string | null;

  /**
   * Browser-compatible HLS renditions.
   */
  renditions: RenditionResult[];
};

const SEGMENT_SECONDS = 6;

/**
 * Pick a useful frame for thumbnail/preview.
 */
export function thumbnailTimestamp(
  durationSeconds: number,
): number {
  if (durationSeconds <= 1) {
    return Math.max(
      0,
      durationSeconds / 2,
    );
  }

  if (durationSeconds <= 4) {
    return Math.min(
      durationSeconds * 0.75,
      Math.max(
        0.5,
        durationSeconds / 2,
      ),
    );
  }

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
      await rm(
        output,
        {
          force: true,
        },
      ).catch(
        () => undefined,
      );

      await ffmpeg([
        "-y",

        "-i",
        sourcePath,

        "-ss",
        at.toFixed(2),

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
 * This is optional.
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

    const generated =
      await stat(
        output,
      ).catch(
        () => null,
      );

    if (
      !generated ||
      generated.size <= 0
    ) {
      return null;
    }

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
 * Generate one browser-compatible HLS rendition.
 *
 * IMPORTANT:
 *
 * This does NOT modify the uploaded original file.
 *
 * The original source is only read by FFmpeg.
 *
 * HLS output:
 *
 * original/
 *   playlist.m3u8
 *   segment-0000.ts
 *   segment-0001.ts
 *   ...
 */
export async function generateRendition(
  sourcePath: string,
  workDir: string,
  videoId: string,
  source: ProbedMedia,
): Promise<RenditionResult> {
  const label = "original";

  const localDir =
    path.join(
      workDir,
      label,
    );

  await mkdir(
    localDir,
    {
      recursive: true,
    },
  );

  /*
   * Keep dimensions even for yuv420p.
   */
  const outputWidth =
    Math.max(
      2,
      Math.floor(
        source.width / 2,
      ) * 2,
    );

  const outputHeight =
    Math.max(
      2,
      Math.floor(
        source.height / 2,
      ) * 2,
    );

  const playlistPath =
    path.join(
      localDir,
      "playlist.m3u8",
    );

  const segmentPattern =
    path.join(
      localDir,
      "segment-%04d.ts",
    );

  const args: string[] = [
    "-y",

    "-i",
    sourcePath,

    "-map",
    "0:v:0",
  ];

  /*
   * Map audio only when it exists.
   */
  if (source.hasAudio) {
    args.push(
      "-map",
      "0:a:0?",
    );
  }

  /*
   * Browser-compatible H.264.
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
     * Reliable HLS keyframe boundaries.
     */
    "-force_key_frames",
    `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,

    "-sc_threshold",
    "0",
  );

  /*
   * Browser-compatible AAC audio.
   */
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
    args.push(
      "-an",
    );
  }

  /*
   * HLS output.
   */
  args.push(
    "-f",
    "hls",

    "-hls_time",
    String(
      SEGMENT_SECONDS,
    ),

    "-hls_playlist_type",
    "vod",

    "-hls_flags",
    "independent_segments",

    "-hls_segment_filename",
    segmentPattern,

    playlistPath,
  );

  console.info(
    `[processor] generating HLS content=${videoId} source=${path.basename(sourcePath)}`,
  );

  await ffmpeg(args);

  /*
   * Verify playlist exists.
   */
  const playlistStat =
    await stat(
      playlistPath,
    ).catch(
      () => null,
    );

  if (
    !playlistStat ||
    playlistStat.size <= 0
  ) {
    throw new FfmpegError(
      "FFmpeg did not create a valid HLS playlist.",
      playlistPath,
    );
  }

  /*
   * Calculate generated HLS size.
   */
  const files =
    await readdir(
      localDir,
    );

  let sizeBytes = 0;

  for (
    const file of files
  ) {
    const filePath =
      path.join(
        localDir,
        file,
      );

    const fileStat =
      await stat(
        filePath,
      ).catch(
        () => null,
      );

    if (
      fileStat?.isFile()
    ) {
      sizeBytes +=
        fileStat.size;
    }
  }

  /*
   * Estimate bandwidth.
   */
  const bitrateKbps =
    Math.max(
      256,
      Math.round(
        (
          source.bitrate ??
          1_000_000
        ) / 1000,
      ),
    );

  return {
    label,

    width:
      outputWidth,

    height:
      outputHeight,

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
 *
 * Because there is currently one rendition,
 * the master playlist points to:
 *
 * original/playlist.m3u8
 */
export async function writeMasterPlaylist(
  workDir: string,
  renditions: RenditionResult[],
): Promise<string> {
  if (
    renditions.length === 0
  ) {
    throw new FfmpegError(
      "Cannot create an HLS master playlist without renditions.",
      "No HLS renditions were generated.",
    );
  }

  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
  ];

  const ordered =
    [...renditions].sort(
      (a, b) =>
        a.height - b.height,
    );

  for (
    const rendition of ordered
  ) {
    const bandwidth =
      Math.max(
        1,
        rendition.bitrateKbps *
          1000,
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
 *
 * IMPORTANT:
 *
 * The original uploaded file is NEVER replaced.
 *
 * We:
 *
 * 1. Probe original
 * 2. Validate original
 * 3. Generate thumbnail
 * 4. Generate optional preview
 * 5. Generate HLS from original
 * 6. Generate master playlist
 *
 * All generated files live in workDir.
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
   * Probe original source.
   */
  const media =
    await probe(
      sourcePath,
    );

  const validation =
    validateProbed(
      media,
    );

  if (
    !validation.ok
  ) {
    throw new FfmpegError(
      validation.reason,
      validation.reason,
    );
  }

  /*
   * Generate thumbnail.
   */
  const thumbnailPath =
    await generateThumbnail(
      sourcePath,
      workDir,
      media.durationSeconds,
    );

  /*
   * Preview is optional.
   */
  const previewPath =
    await generatePreview(
      sourcePath,
      workDir,
      media.durationSeconds,
    );

  /*
   * Generate browser-compatible HLS.
   *
   * This is the important part that was missing
   * from the previous processVideo().
   */
  const rendition =
    await generateRendition(
      sourcePath,
      workDir,
      videoId,
      media,
    );

  const renditions =
    [rendition];

  /*
   * Create master playlist.
   */
  const masterPlaylistPath =
    await writeMasterPlaylist(
      workDir,
      renditions,
    );

  /*
   * Verify master playlist.
   */
  const masterStat =
    await stat(
      masterPlaylistPath,
    ).catch(
      () => null,
    );

  if (
    !masterStat ||
    masterStat.size <= 0
  ) {
    throw new FfmpegError(
      "HLS master playlist was not created.",
      masterPlaylistPath,
    );
  }

  console.info(
    `[processor] processing complete video=${videoId} hls=true thumbnail=true original-preserved=true`,
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