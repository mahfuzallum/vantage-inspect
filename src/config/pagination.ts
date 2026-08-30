export const PAGE_SIZE = {
  grid: 24,
  compact: 12,
  related: 8,
  admin: 50,
  suggestions: 6,
} as const;

export const MAX_PAGE_SIZE = 60;

/** Clamp a user-supplied page number into a sane range. */
export function normalizePage(raw: string | number | null | undefined): number {
  const parsed = typeof raw === "number" ? raw : Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 5000);
}

export function normalizePageSize(
  raw: string | number | null | undefined,
  fallback: number = PAGE_SIZE.grid,
): number {
  const parsed = typeof raw === "number" ? raw : Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_PAGE_SIZE);
}
