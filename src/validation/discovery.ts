import { z } from "zod";
import {
  DATE_VALUES,
  DEFAULT_SEARCH_SORT,
  DEFAULT_SORT,
  DURATION_VALUES,
  SORT_VALUES,
} from "@/config/filters";
import { MAX_PAGE_SIZE } from "@/config/pagination";
import type { DiscoveryFilters } from "@/types/discovery";

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .optional()
  .catch(undefined);

/**
 * Every field is `.catch()`-guarded: a hand-edited or stale URL should degrade
 * to a sensible default rather than throw. `?page=banana` browses page one;
 * `?sort=nonsense` sorts by the surface default.
 */
export const discoveryParamsSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  category: slug,
  tag: slug,
  creator: slug,
  duration: z.enum(DURATION_VALUES).optional().catch(undefined),
  date: z.enum(DATE_VALUES).optional().catch(undefined),
  sort: z.enum(SORT_VALUES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(5000).catch(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().catch(undefined),
});

export type DiscoveryParams = z.infer<typeof discoveryParamsSchema>;

export type ParseOptions = {
  /** Values forced by the route itself, e.g. /category/[slug]. */
  lock?: Partial<Pick<DiscoveryFilters, "category" | "tag" | "creator" | "featuredOnly">>;
  /** Surface default when the URL says nothing — /popular opens on views. */
  defaultSort?: DiscoveryFilters["sort"];
  perPage?: number;
};

/**
 * URL search params -> filters. The single entry point used by every browse
 * page, so all of them read the URL the same way.
 */
export function parseDiscoveryParams(
  raw: Record<string, string | string[] | undefined>,
  options: ParseOptions = {},
): DiscoveryFilters {
  // Repeated params (?tag=a&tag=b) collapse to the first value.
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );

  const parsed = discoveryParamsSchema.parse(flat);
  const query = parsed.q ?? "";
  const hasQuery = query.length >= 2;

  // Relevance only means something with a query; drop it otherwise.
  let sort = parsed.sort ?? options.defaultSort ?? (hasQuery ? DEFAULT_SEARCH_SORT : DEFAULT_SORT);
  if (sort === "relevance" && !hasQuery) sort = DEFAULT_SORT;

  return {
    query,
    category: options.lock?.category ?? parsed.category,
    tag: options.lock?.tag ?? parsed.tag,
    creator: options.lock?.creator ?? parsed.creator,
    duration: parsed.duration,
    date: parsed.date,
    sort,
    page: parsed.page,
    perPage: parsed.perPage ?? options.perPage,
    featuredOnly: options.lock?.featuredOnly,
  };
}

/** Filters that the reader chose (so "Clear all" knows what to remove). */
export function activeFilterCount(filters: DiscoveryFilters, locked: Set<string>): number {
  const keys = ["category", "tag", "creator", "duration", "date"] as const;
  return keys.filter((key) => filters[key] && !locked.has(key)).length;
}
