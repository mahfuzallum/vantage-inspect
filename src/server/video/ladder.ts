/**
 * Rendition ladder.
 *
 * The rule that matters: never upscale. A 480p source gets a 480p rendition
 * and nothing else — inventing a "1080p" variant from it would cost bandwidth
 * and encoding time to deliver a blurrier picture than the original, and would
 * advertise a quality the archive does not actually hold.
 */

export type Rung = {
  label: string;
  height: number;
  /** Video bitrate in kbps, chosen for talk/lecture content rather than sport. */
  bitrateKbps: number;
  audioKbps: number;
  maxrateKbps: number;
  bufsizeKbps: number;
};

export const LADDER: Rung[] = [
  {
    label: "1080p",
    height: 1080,
    bitrateKbps: 5000,
    audioKbps: 128,
    maxrateKbps: 5350,
    bufsizeKbps: 7500,
  },
  {
    label: "720p",
    height: 720,
    bitrateKbps: 2800,
    audioKbps: 128,
    maxrateKbps: 2996,
    bufsizeKbps: 4200,
  },
  {
    label: "480p",
    height: 480,
    bitrateKbps: 1400,
    audioKbps: 96,
    maxrateKbps: 1498,
    bufsizeKbps: 2100,
  },
];

/** Small tolerance so a 1076-line master still yields a 1080p rung. */
const TOLERANCE = 0.95;

/**
 * Rungs appropriate for a source of the given height, tallest first.
 *
 * Always returns at least one rung: a source below the smallest rung is
 * transcoded at its own height, so even a 240p deposit becomes streamable HLS
 * rather than being rejected.
 */
export function selectLadder(sourceHeight: number): Rung[] {
  const usable = LADDER.filter((rung) => sourceHeight >= rung.height * TOLERANCE);
  if (usable.length > 0) return usable;

  const smallest = LADDER[LADDER.length - 1]!;
  const height = evenHeight(sourceHeight);
  return [
    {
      label: `${height}p`,
      height,
      // Scale the bitrate down with the pixel count rather than reusing 480p's.
      bitrateKbps: Math.max(300, Math.round(smallest.bitrateKbps * (height / smallest.height))),
      audioKbps: 96,
      maxrateKbps: Math.max(320, Math.round(smallest.maxrateKbps * (height / smallest.height))),
      bufsizeKbps: Math.max(450, Math.round(smallest.bufsizeKbps * (height / smallest.height))),
    },
  ];
}

/** H.264 requires even dimensions. */
export function evenHeight(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

/** Width preserving the source aspect ratio, rounded to an even number. */
export function widthFor(sourceWidth: number, sourceHeight: number, targetHeight: number): number {
  if (sourceHeight <= 0) return 2;
  const width = Math.round((sourceWidth * targetHeight) / sourceHeight);
  return width % 2 === 0 ? Math.max(2, width) : Math.max(2, width - 1);
}

/** Bandwidth figure advertised in the master playlist: video plus audio. */
export function declaredBandwidth(rung: Rung): number {
  return (rung.bitrateKbps + rung.audioKbps) * 1000;
}
