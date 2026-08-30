import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * Upload gatekeeping.
 *
 * The filename extension is treated only as a hint.
 * The actual container is checked from the file bytes.
 * The worker then performs a second independent validation with ffprobe.
 *
 * Supported video containers:
 *
 * - MP4
 * - MPEG-TS (.ts)
 * - MOV
 * - WebM
 * - Matroska (.mkv)
 * - M4V
 *
 * MPEG-TS deserves special handling because browsers can report several
 * different MIME types for the same .ts file, including:
 *
 * - video/mp2t
 * - video/vnd.dlna.mpeg-tts
 * - application/octet-stream
 */

export const ALLOWED_VIDEO_EXTENSIONS = [
  "mp4",
  "ts",
  "mov",
  "webm",
  "mkv",
  "m4v",
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/mp2t",
  "video/vnd.dlna.mpeg-tts",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/m4v",
  "video/x-m4v",
] as const;

/**
 * MIME types that some browsers/platforms may use for MPEG-TS.
 *
 * These are only accepted when the extension is `.ts` AND the actual bytes
 * pass the MPEG-TS container check below.
 */
const MPEG_TS_MIME_TYPES = new Set([
  "video/mp2t",
  "video/vnd.dlna.mpeg-tts",
  "application/octet-stream",
]);

/**
 * Extensions that must never be accepted, regardless of the claimed MIME.
 */
const DANGEROUS_EXTENSIONS = new Set([
  "exe",
  "dll",
  "so",
  "dylib",
  "bat",
  "cmd",
  "com",
  "scr",
  "msi",
  "app",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "php",
  "phtml",
  "jsp",
  "asp",
  "aspx",
  "js",
  "mjs",
  "cjs",
  "py",
  "rb",
  "pl",
  "jar",
  "war",
  "svg",
  "html",
  "htm",
]);

export type UploadRejection = {
  ok: false;
  reason: string;
};

export type UploadAcceptance = {
  ok: true;
  extension: string;
  detectedMime: string;
};

export type UploadCheck =
  | UploadRejection
  | UploadAcceptance;

/**
 * Detect an MPEG transport stream.
 *
 * Normal MPEG-TS:
 *
 *   packet 0    -> 0x47
 *   packet 188  -> 0x47
 *   packet 376  -> 0x47
 *
 * Some M2TS/Blu-ray transport streams use 192-byte packets with the MPEG
 * sync byte at offset +4.
 */
function isMpegTs(
  head: Buffer,
): boolean {
  const TS_PACKET_SIZE = 188;

  if (
    head.length >=
    TS_PACKET_SIZE * 3
  ) {
    if (
      head[0] === 0x47 &&
      head[TS_PACKET_SIZE] === 0x47 &&
      head[TS_PACKET_SIZE * 2] === 0x47
    ) {
      return true;
    }
  }

  const M2TS_PACKET_SIZE = 192;

  if (
    head.length >=
    M2TS_PACKET_SIZE * 3
  ) {
    if (
      head[4] === 0x47 &&
      head[4 + M2TS_PACKET_SIZE] === 0x47 &&
      head[4 + M2TS_PACKET_SIZE * 2] === 0x47
    ) {
      return true;
    }
  }

  /*
   * A few transport streams can have a small leading prefix before the
   * first 188-byte packet. Look for a valid three-packet alignment within
   * the first 32 bytes.
   */
  const maxOffset = Math.min(
    32,
    head.length - TS_PACKET_SIZE * 3,
  );

  for (
    let offset = 1;
    offset <= maxOffset;
    offset += 1
  ) {
    if (
      head[offset] === 0x47 &&
      head[offset + TS_PACKET_SIZE] === 0x47 &&
      head[offset + TS_PACKET_SIZE * 2] === 0x47
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Detect the actual media container from the file header.
 *
 * Returns a canonical MIME type rather than trusting the browser-declared
 * MIME type.
 */
function sniffContainer(
  head: Buffer,
): string | null {
  /*
   * ---------------------------------------------------------------
   * MP4 / MOV
   * ---------------------------------------------------------------
   *
   * ISO Base Media File Format starts with an ftyp box.
   *
   * bytes 4..7:
   *   ftyp
   *
   * bytes 8..11:
   *   major brand
   */
  if (
    head.length >= 12 &&
    head
      .subarray(4, 8)
      .toString("ascii") === "ftyp"
  ) {
    const brand =
      head
        .subarray(8, 12)
        .toString("ascii")
        .toLowerCase();

    /*
     * QuickTime MOV commonly uses `qt  `.
     */
    if (
      brand.startsWith("qt")
    ) {
      return "video/quicktime";
    }

    return "video/mp4";
  }

  /*
   * ---------------------------------------------------------------
   * WebM / Matroska
   * ---------------------------------------------------------------
   *
   * EBML header:
   *
   * 1A 45 DF A3
   */
  if (
    head.length >= 4 &&
    head[0] === 0x1a &&
    head[1] === 0x45 &&
    head[2] === 0xdf &&
    head[3] === 0xa3
  ) {
    const window =
      head
        .subarray(
          0,
          Math.min(
            head.length,
            4096,
          ),
        )
        .toString("latin1")
        .toLowerCase();

    /*
     * WebM is an EBML-based Matroska profile.
     *
     * Looking for `webm` gives us a useful distinction for the returned
     * canonical MIME type. ffprobe later remains the authoritative check.
     */
    if (
      window.includes("webm")
    ) {
      return "video/webm";
    }

    return "video/x-matroska";
  }

  /*
   * ---------------------------------------------------------------
   * MPEG-TS
   * ---------------------------------------------------------------
   */
  if (
    isMpegTs(head)
  ) {
    return "video/mp2t";
  }

  return null;
}

/**
 * Maximum upload size in bytes.
 */
export function maxUploadBytes(): number {
  return (
    serverEnv()
      .MAX_VIDEO_UPLOAD_MB *
    1024 *
    1024
  );
}

/**
 * Extract a safe extension from the original filename.
 */
function extractExtension(
  filename: string,
): string {
  const basename =
    filename
      .split(/[\\/]/)
      .pop() ?? "";

  const dotIndex =
    basename.lastIndexOf(".");

  if (
    dotIndex <= 0 ||
    dotIndex ===
      basename.length - 1
  ) {
    return "";
  }

  return basename
    .slice(dotIndex + 1)
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      "",
    );
}

/**
 * Validates an uploaded video.
 *
 * Validation layers:
 *
 * 1. Filename extension
 * 2. Dangerous extension rejection
 * 3. File size
 * 4. Browser-declared MIME
 * 5. Actual container/magic bytes
 * 6. Extension/container agreement
 * 7. ffprobe confirmation in the worker
 */
export function validateUpload(
  params: {
    filename: string;
    sizeBytes: number;
    declaredMime: string;
    head: Buffer;
  },
): UploadCheck {
  const {
    filename,
    sizeBytes,
    declaredMime,
    head,
  } = params;

  /*
   * ---------------------------------------------------------------
   * 1. Extension
   * ---------------------------------------------------------------
   */
  const extension =
    extractExtension(
      filename,
    );

  if (!extension) {
    return {
      ok: false,
      reason:
        "The file has no valid extension.",
    };
  }

  /*
   * ---------------------------------------------------------------
   * 2. Dangerous extensions
   * ---------------------------------------------------------------
   */
  if (
    DANGEROUS_EXTENSIONS.has(
      extension,
    )
  ) {
    return {
      ok: false,
      reason:
        "Executable and script files cannot be uploaded.",
    };
  }

  /*
   * ---------------------------------------------------------------
   * 3. Allowed video extensions
   * ---------------------------------------------------------------
   */
  if (
    !(
      ALLOWED_VIDEO_EXTENSIONS as readonly string[]
    ).includes(
      extension,
    )
  ) {
    return {
      ok: false,
      reason:
        `Unsupported file type. Accepted: ${ALLOWED_VIDEO_EXTENSIONS.join(", ")}.`,
    };
  }

  /*
   * ---------------------------------------------------------------
   * 4. File size
   * ---------------------------------------------------------------
   */
  if (
    !Number.isFinite(
      sizeBytes,
    ) ||
    sizeBytes <= 0
  ) {
    return {
      ok: false,
      reason:
        "The file is empty.",
    };
  }

  const limit =
    maxUploadBytes();

  if (
    sizeBytes > limit
  ) {
    return {
      ok: false,
      reason:
        `The file is ${(sizeBytes / 1048576).toFixed(0)}MB. ` +
        `The limit is ${serverEnv().MAX_VIDEO_UPLOAD_MB}MB.`,
    };
  }

  /*
   * ---------------------------------------------------------------
   * 5. MIME validation
   * ---------------------------------------------------------------
   *
   * MPEG-TS is special because browsers can report:
   *
   * video/mp2t
   * video/vnd.dlna.mpeg-tts
   * application/octet-stream
   *
   * For `.ts`, all three are acceptable ONLY if the actual bytes also
   * identify the file as MPEG-TS.
   */
  const normalizedMime =
    declaredMime
      .trim()
      .toLowerCase();

  const mimeAllowed =
    (
      ALLOWED_VIDEO_MIME_TYPES as readonly string[]
    ).includes(
      normalizedMime,
    );

  const mpegTsMime =
    MPEG_TS_MIME_TYPES.has(
      normalizedMime,
    );

  if (
    !mimeAllowed &&
    !(
      extension === "ts" &&
      mpegTsMime
    )
  ) {
    return {
      ok: false,
      reason:
        `Unsupported media type: ${declaredMime || "unknown"}.`,
    };
  }

  /*
   * ---------------------------------------------------------------
   * 6. Actual container detection
   * ---------------------------------------------------------------
   *
   * The browser MIME is never the final authority.
   */
  const detectedMime =
    sniffContainer(
      head,
    );

  if (!detectedMime) {
    return {
      ok: false,
      reason:
        "The file contents are not a recognised video container.",
    };
  }

  /*
   * ---------------------------------------------------------------
   * 7. Extension/container agreement
   * ---------------------------------------------------------------
   */
  let extensionMatches =
    false;

  switch (
    extension
  ) {
    case "mp4":
      extensionMatches =
        detectedMime ===
        "video/mp4";
      break;

    case "ts":
      extensionMatches =
        detectedMime ===
        "video/mp2t";
      break;

    case "mov":
      extensionMatches =
        detectedMime ===
        "video/quicktime";
      break;

    case "webm":
      extensionMatches =
        detectedMime ===
        "video/webm";
      break;

    case "mkv":
      extensionMatches =
        detectedMime ===
        "video/x-matroska";
      break;

    case "m4v":
      extensionMatches =
        detectedMime ===
          "video/mp4" ||
        detectedMime ===
          "video/m4v" ||
        detectedMime ===
          "video/x-m4v";
      break;

    default:
      extensionMatches =
        false;
  }

  if (
    !extensionMatches
  ) {
    return {
      ok: false,
      reason:
        `File extension .${extension} does not match the detected video container (${detectedMime}).`,
    };
  }

  /*
   * ---------------------------------------------------------------
   * Accepted
   * ---------------------------------------------------------------
   */
  return {
    ok: true,
    extension,
    detectedMime,
  };
}