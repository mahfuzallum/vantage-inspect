/**
 * Every browse control in one place: the sort orders, duration buckets and
 * date windows that appear in the filter bar and in the URL.
 *
 * These values are the contract between the URL, the validation schema and the
 * query layer — adding an option means adding it here and handling it in
 * `discovery-service`, and nowhere else.
 */

export const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance", searchOnly: true },
  { value: "newest", label: "Latest" },
  { value: "popular", label: "Most viewed" },
  { value: "liked", label: "Most liked" },
  { value: "bookmarked", label: "Most bookmarked" },
  { value: "trending", label: "Popular this month" },
  { value: "oldest", label: "Oldest first" },
  { value: "longest", label: "Longest first" },
  { value: "shortest", label: "Shortest first" },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  searchOnly?: boolean;
}>;

export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

/** Relevance is meaningless without a query, so listings default to newest. */
export const DEFAULT_SORT: SortOption = "newest";
export const DEFAULT_SEARCH_SORT: SortOption = "relevance";

export const SORT_VALUES = SORT_OPTIONS.map((option) => option.value) as [
  SortOption,
  ...SortOption[],
];

export function isSortOption(value: string | null | undefined): value is SortOption {
  return SORT_OPTIONS.some((option) => option.value === value);
}

/** Sort options valid in a given context. Relevance only ranks a query. */
export function sortOptionsFor(hasQuery: boolean) {
  return SORT_OPTIONS.filter(
    (option) => hasQuery || !("searchOnly" in option && option.searchOnly),
  );
}

export function sortLabel(value: SortOption): string {
  return SORT_OPTIONS.find((option) => option.value === value)?.label ?? "Latest";
}

// ---------------------------------------------------------------- duration

/** Bounds are in seconds; `max: null` means open-ended. */
export const DURATION_OPTIONS = [
  { value: "short", label: "Under 20 minutes", min: 0, max: 1200 },
  { value: "medium", label: "20 to 60 minutes", min: 1200, max: 3600 },
  { value: "long", label: "Over 1 hour", min: 3600, max: null },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  min: number;
  max: number | null;
}>;

export type DurationOption = (typeof DURATION_OPTIONS)[number]["value"];

export const DURATION_VALUES = DURATION_OPTIONS.map((option) => option.value) as [
  DurationOption,
  ...DurationOption[],
];

export function durationBounds(value: DurationOption | undefined) {
  return DURATION_OPTIONS.find((option) => option.value === value);
}

export function durationLabel(value: DurationOption): string {
  return DURATION_OPTIONS.find((option) => option.value === value)?.label ?? "Any length";
}

// ---------------------------------------------------------------- date

export const DATE_OPTIONS = [
  { value: "day", label: "Past 24 hours", days: 1 },
  { value: "week", label: "Past week", days: 7 },
  { value: "month", label: "Past month", days: 30 },
  { value: "year", label: "Past year", days: 365 },
] as const satisfies ReadonlyArray<{ value: string; label: string; days: number }>;

export type DateOption = (typeof DATE_OPTIONS)[number]["value"];

export const DATE_VALUES = DATE_OPTIONS.map((option) => option.value) as [
  DateOption,
  ...DateOption[],
];

/** Earliest publication date allowed by a date filter, or null for any. */
export function publishedSince(value: DateOption | undefined): Date | null {
  const option = DATE_OPTIONS.find((entry) => entry.value === value);
  return option ? new Date(Date.now() - option.days * 86_400_000) : null;
}

export function dateLabel(value: DateOption): string {
  return DATE_OPTIONS.find((option) => option.value === value)?.label ?? "Any date";
}
