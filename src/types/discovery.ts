import type { DateOption, DurationOption, SortOption } from "@/config/filters";
import type { CategorySummary, CreatorSummary, TagSummary } from "./content";

/**
 * The complete state of a browse surface. Parsed from the URL on every
 * request — never held in React state — so a result page is always a shareable,
 * bookmarkable, back-button-safe address.
 */
export type DiscoveryFilters = {
  query: string;
  category?: string;
  tag?: string;
  creator?: string;
  duration?: DurationOption;
  date?: DateOption;
  sort: SortOption;
  page: number;
  perPage?: number;
  /** Restricts to editorially featured items; set by /featured, not the URL. */
  featuredOnly?: boolean;
};

/** Options offered by the filter controls. */
export type FilterFacets = {
  categories: CategorySummary[];
  tags: TagSummary[];
  creators: CreatorSummary[];
};

/** Which filter keys a given surface should expose. */
export type FilterKey = "category" | "tag" | "creator" | "duration" | "date";
