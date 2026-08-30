import { durationBounds, publishedSince, type SortOption } from "@/config/filters";
import { PAGE_SIZE } from "@/config/pagination";
import type { DiscoveryFilters } from "@/types/discovery";
import type { ContentCardModel, CreatorSummary, Paginated } from "@/types/content";
import { mockContent, mockCreators, type MockContent } from "./catalogue";

/**
 * In-memory query engine over the demo catalogue.
 *
 * This exists only so a checkout with an empty database still demonstrates
 * every filter, sort order and page boundary. It is NOT the production path:
 * real queries run as indexed SQL with LIMIT/OFFSET in `discovery-service`,
 * and nothing here ever touches a live catalogue.
 */

function matchesQuery(item: MockContent, query: string): boolean {
  if (query.length < 2) return true;
  const haystack = [
    item.title,
    item.summary ?? "",
    item.creator?.name ?? "",
    item.category?.name ?? "",
    item.tagSlugs.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  // Every term must appear somewhere — the same AND semantics Postgres
  // websearch_to_tsquery gives for unquoted words.
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

/** Crude relevance: title hits outrank body hits, views break ties. */
function relevanceScore(item: MockContent, query: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const title = item.title.toLowerCase();
  const summary = (item.summary ?? "").toLowerCase();

  let score = 0;
  for (const term of terms) {
    if (title.startsWith(term)) score += 6;
    else if (title.includes(term)) score += 4;
    if (summary.includes(term)) score += 2;
    if (item.creator?.name.toLowerCase().includes(term)) score += 3;
    if (item.tagSlugs.some((slug) => slug.includes(term))) score += 1;
  }
  return score;
}

function compare(a: MockContent, b: MockContent, sort: SortOption, query: string): number {
  const published = (item: MockContent) => item.publishedAt?.getTime() ?? 0;

  switch (sort) {
    case "relevance": {
      const delta = relevanceScore(b, query) - relevanceScore(a, query);
      return delta !== 0 ? delta : b.viewCount - a.viewCount;
    }
    case "oldest":
      return published(a) - published(b);
    case "popular":
      return b.viewCount - a.viewCount;
    case "trending": {
      // Views decayed by age, so a recent item can outrank an older giant.
      const heat = (item: MockContent) => {
        const ageDays = Math.max(1, (Date.now() - published(item)) / 86_400_000);
        return item.viewCount / Math.pow(ageDays, 0.8);
      };
      return heat(b) - heat(a);
    }
    case "longest":
      return (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0);
    case "shortest":
      return (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0);
    case "newest":
    default:
      return published(b) - published(a);
  }
}

export function queryMockContent(filters: DiscoveryFilters): Paginated<ContentCardModel> {
  const perPage = filters.perPage ?? PAGE_SIZE.grid;
  const since = publishedSince(filters.date);
  const bounds = durationBounds(filters.duration);

  const matched = mockContent.filter((item) => {
    if (!matchesQuery(item, filters.query)) return false;
    if (filters.category && item.category?.slug !== filters.category) return false;
    if (filters.creator && item.creator?.slug !== filters.creator) return false;
    if (filters.tag && !item.tagSlugs.includes(filters.tag)) return false;
    if (filters.featuredOnly && !item.isFeatured) return false;
    if (since && (item.publishedAt?.getTime() ?? 0) < since.getTime()) return false;
    if (bounds) {
      const duration = item.durationSeconds ?? 0;
      if (duration < bounds.min) return false;
      if (bounds.max !== null && duration >= bounds.max) return false;
    }
    return true;
  });

  const sorted = [...matched].sort((a, b) => compare(a, b, filters.sort, filters.query));

  const total = sorted.length;
  const totalPages = Math.ceil(total / perPage);
  // Clamp rather than 404: a stale ?page=99 shows the last real page.
  const page = totalPages > 0 ? Math.min(filters.page, totalPages) : 1;
  const items = sorted.slice((page - 1) * perPage, page * perPage);

  return { items, page, perPage, total, totalPages, hasMore: page < totalPages };
}

export function queryMockCreators(
  page = 1,
  perPage: number = PAGE_SIZE.grid,
): Paginated<CreatorSummary> {
  const sorted = [...mockCreators].sort((a, b) => b.contentCount - a.contentCount);
  const total = sorted.length;
  const totalPages = Math.ceil(total / perPage);
  const safePage = totalPages > 0 ? Math.min(page, totalPages) : 1;

  return {
    items: sorted.slice((safePage - 1) * perPage, safePage * perPage),
    page: safePage,
    perPage,
    total,
    totalPages,
    hasMore: safePage < totalPages,
  };
}

// ---------------------------------------------------------------- detail

import type { ContentDetailModel, TagSummary } from "@/types/content";
import { mockTags } from "./catalogue";

const tagBySlug = new Map(mockTags.map((tag) => [tag.slug, tag]));

function toDetail(item: MockContent): ContentDetailModel {
  return {
    ...item,
    description: item.description,
    status: "PUBLISHED",
    language: "en",
    recordedAt: item.publishedAt ? new Date(item.publishedAt.getTime() - 14 * 86_400_000) : null,
    playback: item.mediaUrl ? ("playable" as const) : ("unavailable" as const),
    hlsUrl: null,
    mediaUrl: item.mediaUrl,
    tags: item.tagSlugs
      .map((slug) => tagBySlug.get(slug))
      .filter((tag): tag is TagSummary => Boolean(tag)),
    seoTitle: null,
    seoDescription: null,
    ogImageUrl: null,
  };
}

export function getMockContentDetail(slug: string): ContentDetailModel | null {
  const item = mockContent.find((entry) => entry.slug === slug);
  return item ? toDetail(item) : null;
}

/**
 * Same ranking the database path uses: same contributor first, then shared
 * topics, then same subject — never the item being viewed.
 */
export function getMockRelated(slug: string, limit: number): ContentCardModel[] {
  const current = mockContent.find((entry) => entry.slug === slug);
  if (!current) return [];

  const others = mockContent.filter((entry) => entry.slug !== slug);
  const score = (entry: MockContent) => {
    let value = 0;
    if (current.creator && entry.creator?.slug === current.creator.slug) value += 100;
    value += entry.tagSlugs.filter((tag) => current.tagSlugs.includes(tag)).length * 10;
    if (current.category && entry.category?.slug === current.category.slug) value += 5;
    return value;
  };

  return others
    .map((entry) => ({ entry, value: score(entry) }))
    .filter(({ value }) => value > 0)
    .sort((a, b) => b.value - a.value || b.entry.viewCount - a.entry.viewCount)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function getMockCreatorContent(
  creatorSlug: string,
  limit: number,
  excludeSlug?: string,
): ContentCardModel[] {
  return mockContent
    .filter((entry) => entry.creator?.slug === creatorSlug && entry.slug !== excludeSlug)
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, limit);
}
