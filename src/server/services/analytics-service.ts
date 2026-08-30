import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { rangeStart, previousRangeStart, type RangeOption } from "@/config/analytics";
import { contentCardInclude, toContentCards } from "@/server/mappers/content-mapper";
import type { ContentCardModel } from "@/types/content";

/**
 * Analytics queries.
 *
 * Two rules run through this file. First, aggregation never scans the whole
 * view log on a page request: counts are bounded by an indexed `createdAt`
 * window, and anything expensive is cached. Second, nothing is invented — a
 * figure that cannot be derived from stored rows is simply not returned.
 *
 * Privacy: the view log holds a content id, an optional user id, and a
 * rotating opaque session key. No IP address, no location, no device
 * fingerprint. Every aggregate below is a count over those columns.
 */

// ---------------------------------------------------------------- counts

export type ViewTotals = {
  allTime: number;
  today: number;
  week: number;
  month: number;
};

/**
 * Headline view counts.
 *
 * All-time comes from the denormalised `viewCount` sum rather than counting
 * the log, because the log is pruned-in-principle and the counter is the
 * authoritative lifetime figure. The windowed counts come from the log, each
 * bounded by an index.
 */
export const getViewTotals = unstable_cache(
  async (): Promise<ViewTotals> => {
    const now = new Date();
    const midnight = rangeStart("today", now)!;
    const weekAgo = rangeStart("7d", now)!;
    const monthAgo = rangeStart("30d", now)!;

    const [lifetime, today, week, month] = await db.$transaction([
      db.content.aggregate({ _sum: { viewCount: true } }),
      db.view.count({ where: { createdAt: { gte: midnight } } }),
      db.view.count({ where: { createdAt: { gte: weekAgo } } }),
      db.view.count({ where: { createdAt: { gte: monthAgo } } }),
    ]);

    return {
      allTime: lifetime._sum.viewCount ?? 0,
      today,
      week,
      month,
    };
  },
  ["view-totals"],
  { revalidate: 300, tags: ["analytics"] },
);

export type DailyPoint = { date: string; views: number };

/**
 * Views per calendar day across a window.
 *
 * Grouped in Postgres with `date_trunc` rather than pulling rows into Node.
 * Days with no activity are filled in as zero so the series is continuous and
 * a chart cannot imply a gap was a dip.
 */
export async function getViewsOverTime(range: RangeOption): Promise<DailyPoint[]> {
  const start = rangeStart(range) ?? new Date(Date.now() - 365 * 86_400_000);

  const rows = await db.$queryRaw<Array<{ day: Date; views: bigint }>>`
    SELECT date_trunc('day', created_at) AS day, COUNT(*)::bigint AS views
    FROM views
    WHERE created_at >= ${start}
    GROUP BY day
    ORDER BY day ASC`;

  const byDay = new Map<string, number>();
  for (const row of rows) {
    byDay.set(row.day.toISOString().slice(0, 10), Number(row.views));
  }

  const points: DailyPoint[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  // Cap the series so an "all time" range cannot render thousands of columns.
  let guard = 0;
  while (cursor <= end && guard < 400) {
    const key = cursor.toISOString().slice(0, 10);
    points.push({ date: key, views: byDay.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }

  return points;
}

/** Views inside a window, with growth against the preceding equal window. */
export async function getViewComparison(
  range: RangeOption,
): Promise<{ current: number; previous: number; changePercent: number | null }> {
  const start = rangeStart(range);
  const previousStart = previousRangeStart(range);

  if (!start || !previousStart) {
    const total = await db.view.count();
    return { current: total, previous: 0, changePercent: null };
  }

  const [current, previous] = await db.$transaction([
    db.view.count({ where: { createdAt: { gte: start } } }),
    db.view.count({ where: { createdAt: { gte: previousStart, lt: start } } }),
  ]);

  // No baseline means no meaningful percentage — null, not a fabricated 100%.
  const changePercent =
    previous === 0 ? null : Math.round(((current - previous) / previous) * 100);

  return { current, previous, changePercent };
}

// ---------------------------------------------------------------- popular

const PUBLISHED = { status: "PUBLISHED" as const, publishedAt: { not: null } };

/**
 * Most-viewed content over a window.
 *
 * For a bounded range this counts the log so the ranking reflects the period
 * asked for; for all time it uses the denormalised counter, which is both the
 * authoritative lifetime figure and far cheaper.
 */
export async function getPopularContent(
  range: RangeOption = "30d",
  limit = 12,
): Promise<ContentCardModel[]> {
  const start = rangeStart(range);

  if (!start) {
    const rows = await db.content.findMany({
      where: PUBLISHED,
      orderBy: { viewCount: "desc" },
      take: limit,
      include: contentCardInclude,
    });
    return toContentCards(rows);
  }

  const grouped = await db.view.groupBy({
    by: ["contentId"],
    where: { createdAt: { gte: start } },
    _count: { contentId: true },
    orderBy: { _count: { contentId: "desc" } },
    take: limit,
  });

  return hydrateRanked(grouped.map((row) => row.contentId));
}

/**
 * Trending: recent attention, not lifetime totals.
 *
 * Scored as views in the window divided by age in days, with a gentle
 * exponent so a strong recent item can outrank an older one with a much larger
 * lifetime count — which is the entire point of a trending list. The decay is
 * deliberately simple: an elaborate score nobody can reason about is worse
 * than a crude one that behaves predictably.
 */
export async function getTrendingContent(
  windowDays = 7,
  limit = 12,
): Promise<ContentCardModel[]> {
  const since = new Date(Date.now() - windowDays * 86_400_000);

  const rows = await db.$queryRaw<Array<{ id: string; score: number }>>`
    SELECT c.id,
           (COUNT(v.id)::float / POWER(
              GREATEST(EXTRACT(EPOCH FROM (NOW() - c.published_at)) / 86400, 1), 0.8
           )) AS score
    FROM content c
    JOIN views v ON v.content_id = c.id AND v.created_at >= ${since}
    WHERE c.status = 'PUBLISHED' AND c.published_at IS NOT NULL
    GROUP BY c.id
    HAVING COUNT(v.id) > 0
    ORDER BY score DESC
    LIMIT ${limit}`;

  return hydrateRanked(rows.map((row) => row.id));
}

/** Loads cards for ranked ids and restores the ranking order. */
async function hydrateRanked(
  orderedIds: string[],
): Promise<ContentCardModel[]> {
  if (orderedIds.length === 0) {
    return [];
  }

  const records = await db.content.findMany({
    where: {
      id: { in: orderedIds },
      ...PUBLISHED,
    },
    include: contentCardInclude,
  });

  const byId = new Map(
    records.map((record) => [record.id, record]),
  );

  const ordered = orderedIds
    .map((id) => byId.get(id))
    .filter(
      (
        record,
      ): record is (typeof records)[number] =>
        record !== undefined,
    );

  return toContentCards(ordered);
}

/** Cached for the public /popular and /trending rails. */
export const getCachedPopular = unstable_cache(
  async (range: RangeOption) => getPopularContent(range, 12),
  ["popular-content"],
  { revalidate: 600, tags: ["content", "analytics"] },
);

export const getCachedTrending = unstable_cache(
  async () => getTrendingContent(7, 12),
  ["trending-content"],
  { revalidate: 600, tags: ["content", "analytics"] },
);

// ---------------------------------------------------------------- per item

export type ContentStatistics = {
  totalViews: number;
  rangeViews: number;
  favorites: number;
  publishedAt: Date | null;
  /** Views per day since publication. Null when never published. */
  viewsPerDay: number | null;
};

export async function getContentStatistics(
  contentId: string,
  range: RangeOption = "30d",
): Promise<ContentStatistics | null> {
  const start = rangeStart(range);

  const content = await db.content.findUnique({
    where: { id: contentId },
    select: { viewCount: true, favoriteCount: true, publishedAt: true },
  });
  if (!content) return null;

  const rangeViews = await db.view.count({
    where: { contentId, ...(start ? { createdAt: { gte: start } } : {}) },
  });

  let viewsPerDay: number | null = null;
  if (content.publishedAt) {
    const days = Math.max(1, (Date.now() - content.publishedAt.getTime()) / 86_400_000);
    viewsPerDay = Math.round((content.viewCount / days) * 10) / 10;
  }

  return {
    totalViews: content.viewCount,
    rangeViews,
    favorites: content.favoriteCount,
    publishedAt: content.publishedAt,
    viewsPerDay,
  };
}

// ---------------------------------------------------------------- creators

export type CreatorStatistics = {
  id: string;
  slug: string;
  name: string;
  contentCount: number;
  totalViews: number;
  averageViews: number;
  latestPublishedAt: Date | null;
};

/**
 * Contributor leaderboard, computed from content rows rather than stored.
 *
 * The average is derived here on purpose: caching it on the creator row would
 * be a third denormalised counter to keep in step for no measurable gain at
 * this scale.
 */
export async function getTopCreators(limit = 10): Promise<CreatorStatistics[]> {
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      slug: string;
      name: string;
      content_count: bigint;
      total_views: bigint;
      latest: Date | null;
    }>
  >`
    SELECT cr.id, cr.slug, cr.name,
           COUNT(c.id)::bigint AS content_count,
           COALESCE(SUM(c.view_count), 0)::bigint AS total_views,
           MAX(c.published_at) AS latest
    FROM creators cr
    JOIN content c ON c.creator_id = cr.id AND c.status = 'PUBLISHED'
    WHERE cr.is_active = true
    GROUP BY cr.id, cr.slug, cr.name
    ORDER BY total_views DESC
    LIMIT ${limit}`;

  return rows.map((row) => {
    const contentCount = Number(row.content_count);
    const totalViews = Number(row.total_views);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      contentCount,
      totalViews,
      averageViews: contentCount > 0 ? Math.round(totalViews / contentCount) : 0,
      latestPublishedAt: row.latest,
    };
  });
}

/** Statistics for one contributor's profile or admin page. */
export async function getCreatorStatistics(
  creatorId: string,
): Promise<{
  contentCount: number;
  totalViews: number;
  averageViews: number;
  latest: ContentCardModel[];
  popular: ContentCardModel[];
} | null> {
  const aggregate = await db.content.aggregate({
    where: { creatorId, ...PUBLISHED },
    _count: { id: true },
    _sum: { viewCount: true },
  });

  const contentCount = aggregate._count.id;
  if (contentCount === 0) {
    return { contentCount: 0, totalViews: 0, averageViews: 0, latest: [], popular: [] };
  }

  const totalViews = aggregate._sum.viewCount ?? 0;

  const [latestRows, popularRows] = await db.$transaction([
    db.content.findMany({
      where: { creatorId, ...PUBLISHED },
      orderBy: { publishedAt: "desc" },
      take: 4,
      include: contentCardInclude,
    }),
    db.content.findMany({
      where: { creatorId, ...PUBLISHED },
      orderBy: { viewCount: "desc" },
      take: 4,
      include: contentCardInclude,
    }),
  ]);

  return {
    contentCount,
    totalViews,
    averageViews: Math.round(totalViews / contentCount),
    latest: await toContentCards(latestRows),
    popular: await toContentCards(popularRows),
  };
}

// ---------------------------------------------------------------- top content

export type TopContentRow = {
  id: string;
  slug: string;
  title: string;
  creatorName: string | null;
  views: number;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
};

/** Top content for the admin table, ranked within the selected window. */
export async function getTopContent(
  range: RangeOption = "30d",
  limit = 10,
): Promise<TopContentRow[]> {
  const start = rangeStart(range);

  const ids = start
    ? (
        await db.view.groupBy({
          by: ["contentId"],
          where: { createdAt: { gte: start } },
          _count: { contentId: true },
          orderBy: { _count: { contentId: "desc" } },
          take: limit,
        })
      ).map((row) => row.contentId)
    : null;

  const rows = await db.content.findMany({
    where: ids ? { id: { in: ids } } : PUBLISHED,
    orderBy: ids ? undefined : { viewCount: "desc" },
    take: limit,
    select: {
      id: true,
      slug: true,
      title: true,
      viewCount: true,
      publishedAt: true,
      creator: { select: { name: true } },
      thumbnail: { select: { url: true } },
    },
  });

  const mapped: TopContentRow[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    creatorName: row.creator?.name ?? null,
    views: row.viewCount,
    publishedAt: row.publishedAt,
    thumbnailUrl: row.thumbnail?.url ?? null,
  }));

  // Restore the window ranking, which the `IN` lookup discards.
  if (ids) {
    const order = new Map(ids.map((id, index) => [id, index]));
    mapped.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  return mapped;
}

// ---------------------------------------------------------------- users

export type UserStatistics = {
  total: number;
  newInRange: number;
  /**
   * Signed in within the last 30 days. A deliberately narrow definition —
   * it is the only activity signal actually stored, so nothing broader would
   * be honest.
   */
  activeLast30Days: number;
  suspended: number;
};

export async function getUserStatistics(range: RangeOption = "30d"): Promise<UserStatistics> {
  const start = rangeStart(range);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const [total, newInRange, activeLast30Days, suspended] = await db.$transaction([
    db.user.count(),
    db.user.count({ where: start ? { createdAt: { gte: start } } : {} }),
    db.user.count({ where: { lastLoginAt: { gte: thirtyDaysAgo } } }),
    db.user.count({ where: { isActive: false } }),
  ]);

  return { total, newInRange, activeLast30Days, suspended };
}

// ---------------------------------------------------------------- reports

export type ReportStatistics = {
  pending: number;
  thisWeek: number;
  thisMonth: number;
  resolved: number;
  dismissed: number;
};

export async function getReportStatistics(): Promise<ReportStatistics> {
  const weekAgo = rangeStart("7d")!;
  const monthAgo = rangeStart("30d")!;

  const [pending, thisWeek, thisMonth, resolved, dismissed] = await db.$transaction([
    db.report.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    db.report.count({ where: { createdAt: { gte: weekAgo } } }),
    db.report.count({ where: { createdAt: { gte: monthAgo } } }),
    db.report.count({ where: { status: "RESOLVED" } }),
    db.report.count({ where: { status: "DISMISSED" } }),
  ]);

  return { pending, thisWeek, thisMonth, resolved, dismissed };
}

// ---------------------------------------------------------------- favorites

export type FavoriteStatistics = { total: number; inRange: number };

export async function getFavoriteStatistics(
  range: RangeOption = "30d",
): Promise<FavoriteStatistics> {
  const start = rangeStart(range);

  const [total, inRange] = await db.$transaction([
    db.favorite.count(),
    db.favorite.count({ where: start ? { createdAt: { gte: start } } : {} }),
  ]);

  return { total, inRange };
}
