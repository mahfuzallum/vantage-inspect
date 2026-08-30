/**
 * Image upload gatekeeping.
 *
 * The extension is a hint; the decision is made from the file's own magic
 * bytes. A polyglot or a renamed script fails here regardless of what the
 * browser claimed the type was.
 *
 * Deliberately no SVG: it is an executable document format that can carry
 * script, and serving one from our own origin would be a stored-XSS vector.
 */

export const ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif"] as const;

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/** Rejected outright whatever the client claims the type is. */
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
  "xml",
  "swf",
]);

export type ImageCheckFailure = { ok: false; reason: string };
export type ImageCheckSuccess = { ok: true; extension: string; detectedMime: string };
export type ImageCheck = ImageCheckFailure | ImageCheckSuccess;

/**
 * Container signatures.
 * JPEG: FF D8 FF. PNG: the 8-byte signature. WebP/AVIF: RIFF/ftyp boxes.
 */
export function sniffImageMime(head: Uint8Array): string | null {
  if (head.length < 12) return null;

  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";

  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (PNG.every((byte, index) => head[index] === byte)) return "image/png";

  const ascii = (start: number, end: number) =>
    String.fromCharCode(...Array.from(head.subarray(start, end)));

  // RIFF....WEBP
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";

  // ISO-BMFF: ....ftyp<brand>; AVIF brands begin "avif" or "avis".
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (brand.startsWith("avif") || brand.startsWith("avis")) return "image/avif";
  }

  return null;
}

/**
 * Filename sanitisation for *display* only.
 *
 * Storage keys are never derived from this — they are built from generated
 * ids — but a name that reaches an admin table should not carry path
 * separators, control characters or a misleading double extension.
 */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "file";
  return base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 120);
}

export type ImageValidationParams = {
  filename: string;
  sizeBytes: number;
  declaredMime: string;
  head: Uint8Array;
  maxSizeBytes: number;
};

export function validateImage(params: ImageValidationParams): ImageCheck {
  const { filename, sizeBytes, declaredMime, head, maxSizeBytes } = params;

  const extension = (filename.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!extension) return { ok: false, reason: "The file has no extension." };
  if (DANGEROUS_EXTENSIONS.has(extension)) {
    return { ok: false, reason: "That file type cannot be uploaded." };
  }
  if (!(ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(extension)) {
    return {
      ok: false,
      reason: `Unsupported image type. Accepted: ${ALLOWED_IMAGE_EXTENSIONS.join(", ")}.`,
    };
  }

  if (sizeBytes <= 0) return { ok: false, reason: "The file is empty." };
  if (sizeBytes > maxSizeBytes) {
    return {
      ok: false,
      reason: `That image is ${(sizeBytes / 1048576).toFixed(1)}MB. The limit is ${(maxSizeBytes / 1048576).toFixed(0)}MB.`,
    };
  }

  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(declaredMime)) {
    return { ok: false, reason: `Unsupported media type: ${declaredMime}.` };
  }

  // The decisive check: what the bytes actually are.
  const detectedMime = sniffImageMime(head);
  if (!detectedMime) {
    return { ok: false, reason: "The file contents are not a recognised image." };
  }

  // A PNG uploaded as image/jpeg is a mismatch worth refusing rather than
  // silently correcting — it usually means something is wrong upstream.
  const normalizedDeclared = declaredMime === "image/jpg" ? "image/jpeg" : declaredMime;
  if (detectedMime !== normalizedDeclared) {
    return {
      ok: false,
      reason: `The file is really ${detectedMime}, not ${declaredMime}.`,
    };
  }

  return { ok: true, extension, detectedMime };
}

/** Image size ceiling, in bytes. Images are not videos; 12MB is generous. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
