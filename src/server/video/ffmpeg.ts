import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { serverEnv } from "@/lib/env";
import { existsSync } from "node:fs";
import path from "node:path";

const run = promisify(execFile);

/**
 * Thin, safe wrapper around the FFmpeg binaries.
 *
 * Every call goes through execFile with an argument array — never a shell
 * string — so a filename can never be interpreted as a command. Nothing here
 * interpolates user input into a command line.
 */

export class FfmpegError extends Error {
  /** Trimmed stderr, for administrator display and logs. Never shown publicly. */
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = "FfmpegError";
    // Capped so a runaway log cannot fill the database column.
    this.detail = detail.trim().split("\n").slice(-8).join("\n").slice(0, 2000);
  }
}

const TIMEOUT_MS = 6 * 60 * 60 * 1000; // a long lecture can legitimately take hours

async function exec(binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    return await run(binary, args, { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
  } catch (error) {
    const detail =
      typeof error === "object" && error && "stderr" in error
        ? String((error as { stderr: unknown }).stderr)
        : String(error);
    throw new FfmpegError(`${binary} failed`, detail);
  }
}

function resolveBinary(configured: string, bundledName: string): string {
  const candidates: string[] = [];
  const configuredIsPath = configured.includes("\\") || configured.includes("/") || path.isAbsolute(configured);

  if (configuredIsPath) {
    candidates.push(path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured));
  }

  // Prefer the project-local Windows bundle when the env value is the bare
  // command name (the default), so PATH configuration is not required.
  candidates.push(path.resolve(process.cwd(), "tools", bundledName));
  candidates.push(path.resolve(process.cwd(), "tools", `${bundledName}.exe`));
  // Also support running from a nested script directory in development.
  candidates.push(path.resolve(process.cwd(), "..", "tools", bundledName));
  candidates.push(path.resolve(process.cwd(), "..", "tools", `${bundledName}.exe`));
  candidates.push(path.resolve(process.cwd(), "..", "..", "tools", bundledName));
  candidates.push(path.resolve(process.cwd(), "..", "..", "tools", `${bundledName}.exe`));
  candidates.push(configured);

  const existing = candidates.find((candidate) => candidate && existsSync(candidate));
  return existing ?? configured;
}

export const ffmpeg = (args: string[]) =>
  exec(resolveBinary(serverEnv().FFMPEG_PATH, "ffmpeg"), args);
export const ffprobe = (args: string[]) =>
  exec(resolveBinary(serverEnv().FFPROBE_PATH, "ffprobe"), args);

/** Verifies the binaries exist before a job is accepted. */
export async function assertToolchain(): Promise<{ ffmpeg: string; ffprobe: string }> {
  const [a, b] = await Promise.all([ffmpeg(["-version"]), ffprobe(["-version"])]);
  return {
    ffmpeg: a.stdout.split("\n")[0] ?? "unknown",
    ffprobe: b.stdout.split("\n")[0] ?? "unknown",
  };
}

export type ProbedMedia = {
  durationSeconds: number;
  width: number;
  height: number;
  container: string;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrate: number | null;
  sizeBytes: number;
  hasVideo: boolean;
  hasAudio: boolean;
};

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  tags?: Record<string, string>;
};

/**
 * Reads real metadata from the file.
 *
 * Everything the application stores about a video comes from here — never from
 * the uploading client, which can claim any duration or resolution it likes.
 */
export async function probe(filePath: string): Promise<ProbedMedia> {
  const { stdout } = await ffprobe([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  const parsed = JSON.parse(stdout) as {
    streams?: ProbeStream[];
    format?: { duration?: string; size?: string; bit_rate?: string; format_name?: string };
  };

  const streams = parsed.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");

  const duration = Number.parseFloat(parsed.format?.duration ?? video?.duration ?? "0");

  return {
    durationSeconds: Number.isFinite(duration) ? Math.round(duration) : 0,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    container: parsed.format?.format_name ?? "unknown",
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    bitrate: parsed.format?.bit_rate ? Number.parseInt(parsed.format.bit_rate, 10) : null,
    sizeBytes: parsed.format?.size ? Number.parseInt(parsed.format.size, 10) : 0,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
  };
}

/** Codecs the pipeline is prepared to decode. Anything else is rejected early. */
const SUPPORTED_VIDEO_CODECS = new Set([
  "h264",
  "hevc",
  "vp8",
  "vp9",
  "av1",
  "mpeg4",
  "mpeg2video",
  "prores",
  "theora",
]);

export type ValidationFailure = { ok: false; reason: string };
export type ValidationSuccess = { ok: true; media: ProbedMedia };

/**
 * Decides whether a probed file is something we can and should transcode.
 * The messages are written for an administrator to read directly.
 */
export function validateProbed(media: ProbedMedia): ValidationFailure | ValidationSuccess {
  if (!media.hasVideo) {
    return { ok: false, reason: "The file contains no video stream." };
  }
  if (media.width < 1 || media.height < 1) {
    return { ok: false, reason: "The video stream has no usable dimensions." };
  }
  if (media.durationSeconds < 1) {
    return {
      ok: false,
      reason: "The video is shorter than one second, or its duration is unreadable.",
    };
  }
  if (media.videoCodec && !SUPPORTED_VIDEO_CODECS.has(media.videoCodec)) {
    return { ok: false, reason: `Unsupported video codec: ${media.videoCodec}.` };
  }
  return { ok: true, media };
}
