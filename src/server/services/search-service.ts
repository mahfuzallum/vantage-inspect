import "server-only";
import { db } from "@/lib/db";
import { PAGE_SIZE } from "@/config/pagination";
import { normalizeQuery } from "@/lib/security/sanitize";
import type { SortOption } from "@/config/sorting";
import { contentCardInclude, toContentCards } from "@/server/mappers/content-mapper";
import type { ContentCardModel, Paginated } from "@/types/content";
import { emptyPage } from "@/types/content";

export type SearchFilters = {
  page?: number;
  perPage?: number;
  sort?: SortOption;
  categorySlug?: string;
  tagSlug?: string;
  creatorSlug?: string;
};

/**
 * Whether the full-text column exists.
 *
 * `search_vector` is created by prisma/sql/001_search_indexes.sql, which is a
 * separate step from `prisma db push` and is easy to miss. Rather than let
 * search fail with a raw SQL error on an install that skipped it, its presence
 * is checked once and the query falls back to a plain title/summary match.
 *
 * Cached for the process: a column does not appear or vanish mid-request, and
 * probing the catalogue on every search would be a pointless round trip.
 */
let fullTextAvailable: boolean | null = null;

async function hasFullTextColumn(): Promise<boolean> {
  if (fullTextAvailable !== null) return fullTextAvailable;

  try {
    const rows = await db.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'content' AND column_name = 'search_vector'
      ) AS exists`;
    fullTextAvailable = Boolean(rows[0]?.exists);
  } catch {
    fullTextAvailable = false;
  }
  return fullTextAvailable;
}

/**
 * Substring search across title, summary, contributor and category.
 *
 * The fallback when the full-text column is absent. Genuinely worse — no
 * stemming, no ranking, no phrase handling — but it returns the obvious
 * matches, which is the difference between a search box that works and one
 * that returns nothing at all.
 */
async function searchByContains(
  query: string,
  page: number,
  perPage: number,
): Promise<Paginated<ContentCardModel>> {
  const where = {
    status: "PUBLISHED" as const,
    publishedAt: { not: null },
    OR: [
      { title: { contains: query, mode: "insensitive" as const } },
      { summary: { contains: query, mode: "insensitive" as const } },
      { creator: { name: { contains: query, mode: "insensitive" as const } } },
      { category: { name: { contains: query, mode: "insensitive" as const } } },
    ],
  };

  const [total, rows] = await Promise.all([
    db.content.count({ where }),
    db.content.findMany({
      where,
      include: contentCardInclude,
      // No relevance score to sort by, so the most-watched match leads.
      orderBy: [{ viewCount: "desc" }, { publishedAt: "desc" }],
      take: perPage,
      skip: (page - 1) * perPage,
    }),
  ]);

  const totalPages = Math.ceil(total / perPage);
  return {
    items: await toContentCards(rows),
    page,
    perPage,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

/**
 * Full-text search over the generated `search_vector` column (see
 * prisma/sql/001_search_indexes.sql). Ranking is Postgres-side; Prisma is
 * used for the hydrate step so the mapper stays shared.
 *
 * All user input is parameterised — never string-concatenated into SQL.
 */
export async function searchContent(
  rawQuery: string,
  filters: SearchFilters = {},
): Promise<Paginated<ContentCardModel>> {
  const query = normalizeQuery(rawQuery);
  const page = Math.max(1, filters.page ?? 1);
  const perPage = filters.perPage ?? PAGE_SIZE.grid;

  if (query.length < 2) return emptyPage<ContentCardModel>(perPage);

  if (!(await hasFullTextColumn())) return searchByContains(query, page, perPage);

  try {
    // websearch_to_tsquery handles quoted phrases and OR/- operators safely.
    const rows = await db.$queryRaw<Array<{ id: string; rank: number; total: bigint }>>`
      WITH matches AS (
        SELECT c.id,
               ts_rank(c.search_vector, websearch_to_tsquery('english', ${query})) AS rank
        FROM content c
        WHERE c.status = 'PUBLISHED'
          AND c.published_at IS NOT NULL
          AND c.search_vector @@ websearch_to_tsquery('english', ${query})
      )
      SELECT id, rank, COUNT(*) OVER ()::bigint AS total
      FROM matches
      ORDER BY rank DESC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`;

    if (rows.length === 0) return emptyPage<ContentCardModel>(perPage);

    const orderedIds = rows.map((row) => row.id);
    const records = await db.content.findMany({
      where: { id: { in: orderedIds } },
      include: contentCardInclude,
    });

    // Restore relevance order lost by the `IN` lookup.
    const byId = new Map(records.map((record) => [record.id, record]));
    const ordered = orderedIds
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const total = Number(rows[0]?.total ?? 0);
    const totalPages = Math.ceil(total / perPage);

    return {
      items: await toContentCards(ordered),
      page,
      perPage,
      total,
      totalPages,
      hasMore: page < totalPages,
    };
  } catch (error) {
    // The column exists but the query failed — a missing extension, say.
    // Answer with something rather than an error page.
    console.error("[search] full-text query failed, using substring match:", error);
    fullTextAvailable = false;
    return searchByContains(query, page, perPage);
  }
}

/** Header autocomplete: trigram prefix match, deliberately tiny. */
export async function searchSuggestions(rawQuery: string) {
  const query = normalizeQuery(rawQuery, 60);
  if (query.length < 2) return { content: [], creators: [], tags: [] };

  const [content, creators, tags] = await Promise.all([
    db.content.findMany({
      where: { status: "PUBLISHED", title: { contains: query, mode: "insensitive" } },
      select: { slug: true, title: true },
      orderBy: { viewCount: "desc" },
      take: PAGE_SIZE.suggestions,
    }),
    db.creator.findMany({
      where: { isActive: true, name: { contains: query, mode: "insensitive" } },
      select: { slug: true, name: true },
      orderBy: { totalViews: "desc" },
      take: 3,
    }),
    db.tag.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      select: { slug: true, name: true },
      orderBy: { contentCount: "desc" },
      take: 3,
    }),
  ]);

  return { content, creators, tags };
}
