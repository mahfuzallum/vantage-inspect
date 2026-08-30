/**
 * Server-side image dimension extraction.
 *
 * Reads width and height from the container header rather than decoding the
 * image, so cost is a few bytes regardless of file size and a malformed or
 * hostile file cannot trigger a decode. No dependency: the four formats this
 * project accepts each declare their size in a fixed, well-documented header,
 * and pulling in an image library to read those bytes would not earn its
 * weight.
 *
 * Dimensions are read from the file, never from the uploading client.
 */

export type ImageDimensions = { width: number; height: number };

/** JPEG: walk the segment chain to the SOF marker that carries the size. */
function jpegSize(buffer: Buffer): ImageDimensions | null {
  let offset = 2; // skip SOI

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1]!;

    // SOF0–SOF15, excluding DHT (c4), JPG (c8) and DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null; // malformed; refuse rather than loop
    offset += 2 + segmentLength;
  }
  return null;
}

/** PNG: IHDR is always the first chunk, at a fixed offset. */
function pngSize(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** WebP: three sub-formats, each storing the size differently. */
function webpSize(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30) return null;
  const format = buffer.subarray(12, 16).toString("ascii");

  if (format === "VP8 ") {
    // Lossy: 14-bit dimensions after the start code.
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (format === "VP8L") {
    // Lossless: 14 bits each, packed across four bytes.
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === "VP8X") {
    // Extended: 24-bit little-endian, stored as value minus one.
    const read24 = (at: number) => buffer[at]! | (buffer[at + 1]! << 8) | (buffer[at + 2]! << 16);
    return { width: read24(24) + 1, height: read24(27) + 1 };
  }
  return null;
}

/** AVIF/HEIF: walk ISO-BMFF boxes to the ispe property. */
function avifSize(buffer: Buffer): ImageDimensions | null {
  // ispe is small and always near the front; scanning a bounded window keeps
  // this from becoming a parser for the whole container.
  const window = buffer.subarray(0, Math.min(buffer.length, 4096));
  const marker = window.indexOf("ispe", 0, "ascii");
  if (marker === -1 || marker + 16 > window.length) return null;

  // ispe: 4-byte type, 4-byte version/flags, then width and height.
  return {
    width: window.readUInt32BE(marker + 8),
    height: window.readUInt32BE(marker + 12),
  };
}

/** Sanity bounds: rejects a header that decoded to nonsense. */
const MAX_DIMENSION = 20_000;

function valid(size: ImageDimensions | null): ImageDimensions | null {
  if (!size) return null;
  const { width, height } = size;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 1 || height < 1) return null;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) return null;
  return { width, height };
}

/**
 * Reads dimensions from an image buffer. Returns null when the header cannot
 * be understood — a caller must treat that as "unknown", never as an error,
 * since a missing dimension only costs a layout hint.
 */
export function readImageDimensions(buffer: Buffer, detectedMime: string): ImageDimensions | null {
  try {
    switch (detectedMime) {
      case "image/jpeg":
        return valid(jpegSize(buffer));
      case "image/png":
        return valid(pngSize(buffer));
      case "image/webp":
        return valid(webpSize(buffer));
      case "image/avif":
        return valid(avifSize(buffer));
      default:
        return null;
    }
  } catch {
    // A truncated or hostile header must not throw into the upload path.
    return null;
  }
}

/** Bytes needed to read a header. Enough for every format handled above. */
export const HEADER_BYTES = 8192;
