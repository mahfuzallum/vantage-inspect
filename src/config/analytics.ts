/**
 * Analytics time ranges.
 *
 * One definition shared by the URL parser, the queries and the labels, so a
 * range can never mean one thing in a heading and another in a query.
 */
export const RANGE_OPTIONS = [
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "all", label: "All time", days: null },
] as const satisfies ReadonlyArray<{ value: string; label: string; days: number | null }>;

export type RangeOption = (typeof RANGE_OPTIONS)[number]["value"];

export const DEFAULT_RANGE: RangeOption = "30d";

export const RANGE_VALUES = RANGE_OPTIONS.map((option) => option.value) as [
  RangeOption,
  ...RangeOption[],
];

export function isRangeOption(value: string | null | undefined): value is RangeOption {
  return RANGE_OPTIONS.some((option) => option.value === value);
}

export function rangeLabel(value: RangeOption): string {
  return RANGE_OPTIONS.find((option) => option.value === value)?.label ?? "Last 30 days";
}

export function rangeDays(value: RangeOption): number | null {
  const option = RANGE_OPTIONS.find((entry) => entry.value === value);
  // `?? 30` would be wrong here: "all time" has a legitimate null, and
  // collapsing it to 30 makes an unbounded range silently report 30 days.
  // Only an unknown value falls back.
  return option ? option.days : 30;
}

/**
 * Start of the window, or null for all time.
 *
 * "Today" means since local midnight rather than the last 24 hours — an
 * administrator reading "views today" expects the calendar day, not a rolling
 * window that quietly includes yesterday evening.
 */
export function rangeStart(value: RangeOption, now = new Date()): Date | null {
  if (value === "all") return null;

  if (value === "today") {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    return midnight;
  }

  const days = rangeDays(value);
  if (days === null) return null; // unbounded
  return new Date(now.getTime() - days * 86_400_000);
}

/** Equal-length window immediately before the current one, for growth. */
export function previousRangeStart(value: RangeOption, now = new Date()): Date | null {
  const start = rangeStart(value, now);
  if (!start) return null;
  const span = now.getTime() - start.getTime();
  return new Date(start.getTime() - span);
}
