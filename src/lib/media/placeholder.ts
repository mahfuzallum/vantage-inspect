/**
 * Deterministic gradient used wherever a thumbnail or avatar is missing.
 * Same input always yields the same colours, so grids stay visually stable
 * between renders instead of flickering random placeholders.
 */
const PALETTE = [
  ["#2A3140", "#161A22"],
  ["#33302A", "#1A1814"],
  ["#26333A", "#141C21"],
  ["#302A38", "#191520"],
  ["#2C3A33", "#141E1A"],
] as const;

export function placeholderGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const pair = PALETTE[Math.abs(hash) % PALETTE.length] ?? PALETTE[0];
  return `linear-gradient(135deg, ${pair[0]} 0%, ${pair[1]} 100%)`;
}

/** Two-letter monogram for avatar fallbacks. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "?";
}
