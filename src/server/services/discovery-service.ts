import "server-only";

import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";

import { db, safeQuery } from "@/lib/db";
import { PAGE_SIZE } from "@/config/pagination";
import {
  durationBounds,
  publishedSince,
  type SortOption,
} from "@/config/filters";
import { normalizeQuery } from "@/lib/security/sanitize";
import { resolveAssetUrl } from "@/lib/media";

import {
  contentCardInclude,
  toContentCards,
  toCreatorSummary,
} from "@/server/mappers/content-mapper";

import type {
  ContentCardModel,
  CreatorSummary,
  Paginated,
  TagSummary,
} from "@/types/content";

import type {
  DiscoveryFilters,
  FilterFacets,
} from "@/types/discovery";

import {
  listCategories,
  listPopularTags,
} from "./taxonomy-service";

import {
  queryMockContent,
  queryMockCreators,
} from "@/lib/mock/query";

import {
  mockCategories,
  mockCreators,
  mockTagsInUse,
} from "@/lib/mock/catalogue";

/**
 * The one query path behind /search, /latest, /popular, /featured and every
 * category, tag and contributor page.
 *
 * Filtering, sorting and pagination all happen in the database. The browser
 * never receives more than one page of rows.
 */

/** Public surfaces only ever see published rows. */
const PUBLISHED: Prisma.ContentWhereInput = {
  status: "PUBLISHED",
  publishedAt: {
    not: null,
  },
};

/**
 * Build the common Prisma filter.
 */
function buildWhere(
  filters: DiscoveryFilters,
): Prisma.ContentWhereInput {
  const since =
    publishedSince(
      filters.date,
    );

  const bounds =
    durationBounds(
      filters.duration,
    );

  const duration:
    | Prisma.IntNullableFilter
    | undefined = bounds
    ? {
        gte: bounds.min,
        ...(bounds.max !== null
          ? {
              lt: bounds.max,
            }
          : {}),
      }
    : undefined;

  return {
    ...PUBLISHED,

    ...(filters.category
      ? {
          category: {
            slug: filters.category,
          },
        }
      : {}),

    ...(filters.creator
      ? {
          creator: {
            slug: filters.creator,
          },
        }
      : {}),

    ...(filters.tag
      ? {
          tags: {
            some: {
              tag: {
                slug: filters.tag,
              },
            },
          },
        }
      : {}),

    ...(filters.featuredOnly
      ? {
          isFeatured: true,
        }
      : {}),

    ...(since
      ? {
          publishedAt: {
            gte: since,
          },
        }
      : {}),

    ...(duration
      ? {
          durationSeconds:
            duration,
        }
      : {}),

    /**
     * Trigram-indexed prefix-style matching.
     * Full-text ranking is handled separately by searchRanked().
     */
    ...(filters.query.length >= 2
      ? {
          OR: [
            {
              title: {
                contains:
                  filters.query,
                mode:
                  "insensitive",
              },
            },
            {
              summary: {
                contains:
                  filters.query,
                mode:
                  "insensitive",
              },
            },
          ],
        }
      : {}),
  };
}

/**
 * Standard database ordering.
 */
function buildOrderBy(
  sort: SortOption,
): Prisma.ContentOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [
        {
          publishedAt: "asc",
        },
      ];

    case "popular":
      return [
        {
          viewCount: "desc",
        },
        {
          publishedAt: "desc",
        },
      ];

    case "liked":
      return [
        {
          likeCount: "desc",
        },
        {
          publishedAt: "desc",
        },
      ];

    case "bookmarked":
      return [
        {
          favoriteCount: "desc",
        },
        {
          publishedAt: "desc",
        },
      ];

    case "trending":
      /**
       * Fallback ordering only.
       * Real trending is ranked by view velocity below.
       */
      return [
        {
          publishedAt: "desc",
        },
        {
          viewCount: "desc",
        },
      ];

    case "longest":
      return [
        {
          durationSeconds:
            "desc",
        },
      ];

    case "shortest":
      return [
        {
          durationSeconds:
            "asc",
        },
      ];

    case "relevance":
    case "newest":
    default:
      return [
        {
          publishedAt: "desc",
        },
      ];
  }
}

/**
 * Full-text relevance ordering.
 *
 * PostgreSQL returns only IDs and ranking here.
 * The complete content records are hydrated separately through
 * contentCardInclude so the mapper receives the exact same shape
 * as every other content query.
 */
async function searchRanked(
  filters: DiscoveryFilters,
  perPage: number,
): Promise<
  Paginated<ContentCardModel>
> {
  const query =
    normalizeQuery(
      filters.query,
    );

  const offset =
    (filters.page - 1) *
    perPage;

  const rows =
    await db.$queryRaw<
      Array<{
        id: string;
        total: bigint;
      }>
    >`
      WITH matches AS (
        SELECT
          c.id,
          ts_rank(
            c.search_vector,
            websearch_to_tsquery(
              'english',
              ${query}
            )
          ) AS rank

        FROM content c

        LEFT JOIN categories cat
          ON cat.id = c.category_id

        LEFT JOIN creators cr
          ON cr.id = c.creator_id

        WHERE c.status = 'PUBLISHED'
          AND c.published_at IS NOT NULL

          AND c.search_vector @@
            websearch_to_tsquery(
              'english',
              ${query}
            )

          AND (
            ${filters.category ?? null}::text IS NULL
            OR cat.slug =
              ${filters.category ?? null}
          )

          AND (
            ${filters.creator ?? null}::text IS NULL
            OR cr.slug =
              ${filters.creator ?? null}
          )
      )

      SELECT
        id,
        COUNT(*) OVER ()::bigint AS total

      FROM matches

      ORDER BY rank DESC

      LIMIT ${perPage}
      OFFSET ${offset}
    `;

  if (rows.length === 0) {
    return {
      items: [],
      page: 1,
      perPage,
      total: 0,
      totalPages: 0,
      hasMore: false,
    };
  }

  /**
   * Preserve the ranking returned by PostgreSQL.
   */
  const orderedIds =
    rows.map(
      (row) => row.id,
    );

  /**
   * Hydrate complete Prisma records.
   *
   * IMPORTANT:
   * Do not annotate record as { id: string } here.
   * That strips the inferred Prisma include type and causes
   * toContentCards() to reject the resulting array.
   */
  const records =
    await db.content.findMany({
      where: {
        id: {
          in: orderedIds,
        },
        ...PUBLISHED,
      },

      include:
        contentCardInclude,
    });

  /**
   * Map complete records by ID.
   *
   * TypeScript now preserves the full Prisma record type.
   */
  const byId = new Map(
    records.map(
      (record) => [
        record.id,
        record,
      ] as const,
    ),
  );

  /**
   * Restore PostgreSQL relevance order.
   */
  const ordered =
    orderedIds
      .map((id) =>
        byId.get(id),
      )
      .filter(
        (
          row,
        ): row is (typeof records)[number] =>
          Boolean(row),
      );

  const total =
    Number(
      rows[0]?.total ?? 0,
    );

  const totalPages =
    Math.ceil(
      total / perPage,
    );

  return {
    items:
      await toContentCards(
        ordered,
      ),

    page:
      filters.page,

    perPage,

    total,

    totalPages,

    hasMore:
      filters.page <
      totalPages,
  };
}

/**
 * True when the catalogue has no published rows.
 */
const catalogueIsEmpty =
  unstable_cache(
    async () =>
      (
        await db.content.count({
          where: PUBLISHED,
        })
      ) === 0,

    ["catalogue-empty"],

    {
      revalidate: 60,
      tags: ["content"],
    },
  );

export type DiscoveryResult =
  Paginated<ContentCardModel> & {
    /** True when demo catalogue answered instead of real database rows. */
    isDemo: boolean;
  };

/**
 * Main content discovery endpoint.
 */
export async function findContent(
  filters: DiscoveryFilters,
): Promise<DiscoveryResult> {
  const perPage =
    filters.perPage ??
    PAGE_SIZE.grid;

  const isEmpty =
    await safeQuery(
      () => catalogueIsEmpty(),
      true,
    );

  if (isEmpty) {
    return {
      ...queryMockContent(
        filters,
      ),
      isDemo: true,
    };
  }

  const result =
    await safeQuery(
      async () => {
        /**
         * Relevance uses PostgreSQL full-text ranking.
         */
        if (
          filters.sort ===
            "relevance" &&
          filters.query.length >= 2
        ) {
          return searchRanked(
            filters,
            perPage,
          );
        }

        /**
         * Trending uses recent view velocity.
         */
        if (
          filters.sort ===
            "trending" &&
          !filters.query
        ) {
          const ranked =
            await rankTrending(
              filters,
              perPage,
            );

          if (ranked) {
            return ranked;
          }
        }

        const where =
          buildWhere(
            filters,
          );

        const [
          total,
          rows,
        ] =
          await db.$transaction([
            db.content.count({
              where,
            }),

            db.content.findMany({
              where,

              orderBy:
                buildOrderBy(
                  filters.sort,
                ),

              skip:
                (filters.page -
                  1) *
                perPage,

              take:
                perPage,

              include:
                contentCardInclude,
            }),
          ]);

        const totalPages =
          Math.ceil(
            total / perPage,
          );

        return {
          items:
            await toContentCards(
              rows,
            ),

          page:
            filters.page,

          perPage,

          total,

          totalPages,

          hasMore:
            filters.page <
            totalPages,
        };
      },

      null,
    );

  /**
   * A failed query should surface as an error state.
   */
  if (!result) {
    throw new Error(
      "Content query failed",
    );
  }

  return {
    ...result,
    isDemo: false,
  };
}

/**
 * Contributor results shown alongside content on the search page.
 */
export async function findCreators(
  query: string,
  limit = 4,
): Promise<{
  items: CreatorSummary[];
  isDemo: boolean;
}> {
  if (
    query.length < 2
  ) {
    return {
      items: [],
      isDemo: false,
    };
  }

  const isEmpty =
    await safeQuery(
      () => catalogueIsEmpty(),
      true,
    );

  if (isEmpty) {
    const needle =
      query.toLowerCase();

    return {
      items:
        mockCreators
          .filter(
            (creator) =>
              creator.name
                .toLowerCase()
                .includes(
                  needle,
                ),
          )
          .slice(
            0,
            limit,
          ),

      isDemo: true,
    };
  }

  const rows =
    await safeQuery(
      () =>
        db.creator.findMany({
          where: {
            isActive: true,

            name: {
              contains: query,
              mode:
                "insensitive",
            },
          },

          orderBy: {
            totalViews:
              "desc",
          },

          take: limit,

          include: {
            avatar: true,
          },
        }),

      [],
    );

  const items =
    (
      await Promise.all(
        rows.map(
          toCreatorSummary,
        ),
      )
    ).filter(
      (
        row,
      ): row is CreatorSummary =>
        row !== null,
    );

  return {
    items,
    isDemo: false,
  };
}

/**
 * Filter options for browse/search controls.
 */
export async function getFilterFacets(): Promise<FilterFacets> {
  const isEmpty =
    await safeQuery(
      () => catalogueIsEmpty(),
      true,
    );

  if (isEmpty) {
    return {
      categories:
        mockCategories,

      tags:
        mockTagsInUse,

      creators:
        mockCreators,
    };
  }

  const [
    categories,
    tags,
    creators,
  ] = await Promise.all([
    safeQuery(
      () => listCategories(),
      mockCategories,
    ),

    safeQuery(
      () =>
        listPopularTags(
          30,
        ),
      [] as TagSummary[],
    ),

    safeQuery(
      async () => {
        const rows =
          await db.creator.findMany({
            where: {
              isActive: true,

              contentCount: {
                gt: 0,
              },
            },

            orderBy: {
              contentCount:
                "desc",
            },

            take: 30,

            include: {
              avatar: true,
            },
          });

        return (
          await Promise.all(
            rows.map(
              toCreatorSummary,
            ),
          )
        ).filter(
          (
            row,
          ): row is CreatorSummary =>
            row !== null,
        );
      },

      [] as CreatorSummary[],
    ),
  ]);

  return {
    categories,
    tags,
    creators,
  };
}

/**
 * Paginated contributor directory.
 */
export async function findCreatorPage(
  page: number,
  perPage: number =
    PAGE_SIZE.grid,
): Promise<
  Paginated<CreatorSummary> & {
    isDemo: boolean;
  }
> {
  const isEmpty =
    await safeQuery(
      () => catalogueIsEmpty(),
      true,
    );

  if (isEmpty) {
    return {
      ...queryMockCreators(
        page,
        perPage,
      ),
      isDemo: true,
    };
  }

  const where = {
    isActive: true,
    contentCount: {
      gt: 0,
    },
  };

  const result =
    await safeQuery(
      async () => {
        const [
          total,
          rows,
        ] =
          await db.$transaction([
            db.creator.count({
              where,
            }),

            db.creator.findMany({
              where,

              orderBy: [
                {
                  totalViews:
                    "desc",
                },
                {
                  name: "asc",
                },
              ],

              skip:
                (page - 1) *
                perPage,

              take:
                perPage,

              include: {
                avatar: true,
              },
            }),
          ]);

        const items =
          (
            await Promise.all(
              rows.map(
                toCreatorSummary,
              ),
            )
          ).filter(
            (
              row,
            ): row is CreatorSummary =>
              row !== null,
          );

        const totalPages =
          Math.ceil(
            total / perPage,
          );

        return {
          items,

          page,

          perPage,

          total,

          totalPages,

          hasMore:
            page <
            totalPages,
        };
      },

      null,
    );

  if (!result) {
    throw new Error(
      "Creator query failed",
    );
  }

  return {
    ...result,
    isDemo: false,
  };
}

// -----------------------------------------------------------------------------
// Detail
// -----------------------------------------------------------------------------

import {
  getContentBySlug,
  getRelatedContent,
} from "./content-service";

import {
  getMockContentDetail,
  getMockCreatorContent,
  getMockRelated,
} from "@/lib/mock/query";

import {
  CREATOR_BIOS,
} from "@/lib/mock/catalogue";

import type {
  ContentDetailModel,
} from "@/types/content";

/**
 * One recording by slug.
 *
 * Uses the demo catalogue when the real database has no published rows.
 */
export async function findContentBySlug(
  slug: string,
  includeUnpublished = false,
): Promise<{
  content: ContentDetailModel;
  isDemo: boolean;
} | null> {
  /**
   * Staff preview always goes directly to the database.
   */
  if (
    includeUnpublished
  ) {
    const content =
      await safeQuery(
        () =>
          getContentBySlug(
            slug,
            true,
          ),
        null,
      );

    return content
      ? {
          content,
          isDemo: false,
        }
      : null;
  }

  const isEmpty =
    await safeQuery(
      () => catalogueIsEmpty(),
      true,
    );

  if (isEmpty) {
    const content =
      getMockContentDetail(
        slug,
      );

    return content
      ? {
          content,
          isDemo: true,
        }
      : null;
  }

  const content =
    await safeQuery(
      () =>
        getContentBySlug(
          slug,
        ),
      null,
    );

  return content
    ? {
        content,
        isDemo: false,
      }
    : null;
}

/**
 * Related recordings.
 *
 * Same contributor first, then shared topics, then same subject.
 */
export async function findRelated(
  content: ContentDetailModel,
  limit = 8,
): Promise<
  ContentCardModel[]
> {
  const isEmpty =
    await safeQuery(
      () => catalogueIsEmpty(),
      true,
    );

  if (isEmpty) {
    return getMockRelated(
      content.slug,
      limit,
    );
  }

  return safeQuery(
    () =>
      getRelatedContent(
        content,
        limit,
      ),
    [],
  );
}

/**
 * Recent recordings by one contributor.
 */
export async function findCreatorContent(
  creatorSlug: string,
  limit = 4,
  excludeSlug?: string,
): Promise<
  ContentCardModel[]
> {
  const isEmpty =
    await safeQuery(
      () => catalogueIsEmpty(),
      true,
    );

  if (isEmpty) {
    return getMockCreatorContent(
      creatorSlug,
      limit,
      excludeSlug,
    );
  }

  const rows =
    await safeQuery(
      () =>
        db.content.findMany({
          where: {
            ...PUBLISHED,

            creator: {
              slug: creatorSlug,
            },

            ...(excludeSlug
              ? {
                  slug: {
                    not:
                      excludeSlug,
                  },
                }
              : {}),
          },

          orderBy: {
            publishedAt:
              "desc",
          },

          take: limit,

          include:
            contentCardInclude,
        }),

      [],
    );

  return toContentCards(
    rows,
  );
}

/**
 * Full contributor profile.
 */
export type CreatorProfile = {
  id: string;
  slug: string;
  name: string;

  bio: string | null;

  /**
   * Long-form profile text.
   */
  about: string | null;

  /**
   * Platform handles as { platform: url }.
   */
  socialLinks:
    Record<
      string,
      string
    >;

  avatarUrl:
    string | null;

  bannerUrl:
    string | null;

  websiteUrl:
    string | null;

  isVerified: boolean;

  contentCount:
    number;

  totalViews:
    number;

  joinedAt:
    Date | null;

  seoTitle:
    string | null;

  seoDescription:
    string | null;
};

/**
 * Full contributor record for the profile header.
 */
export async function findCreatorProfile(
  slug: string,
): Promise<
  CreatorProfile | null
> {
  const isEmpty =
    await safeQuery(
      () => catalogueIsEmpty(),
      true,
    );

  if (isEmpty) {
    const creator =
      mockCreators.find(
        (entry) =>
          entry.slug ===
          slug,
      );

    if (!creator) {
      return null;
    }

    /**
     * Derive numbers from demo rows.
     */
    const items =
      getMockCreatorContent(
        slug,
        500,
      );

    const oldest =
      items.reduce<
        Date | null
      >(
        (
          earliest,
          item,
        ) => {
          if (
            !item.publishedAt
          ) {
            return earliest;
          }

          return !earliest ||
            item.publishedAt <
              earliest
            ? item.publishedAt
            : earliest;
        },
        null,
      );

    return {
      id: creator.id,

      slug:
        creator.slug,

      name:
        creator.name,

      bio:
        CREATOR_BIOS[
          creator.slug
        ] ?? null,

      avatarUrl:
        creator.avatarUrl,

      bannerUrl:
        null,

      websiteUrl:
        null,

      about:
        null,

      socialLinks: {},

      isVerified:
        creator.isVerified,

      contentCount:
        creator.contentCount,

      totalViews:
        items.reduce(
          (
            sum,
            item,
          ) =>
            sum +
            item.viewCount,
          0,
        ),

      joinedAt:
        oldest,

      seoTitle:
        null,

      seoDescription:
        null,
    };
  }

  const row =
    await safeQuery(
      () =>
        db.creator.findFirst({
          where: {
            slug,
            isActive: true,
          },

          include: {
            avatar: true,
            banner: true,
          },
        }),

      null,
    );

  if (!row) {
    return null;
  }

  /**
   * First published recording is used as a fallback joined date.
   */
  const first =
    await safeQuery(
      () =>
        db.content.findFirst({
          where: {
            ...PUBLISHED,
            creatorId:
              row.id,
          },

          orderBy: {
            publishedAt:
              "asc",
          },

          select: {
            publishedAt:
              true,
          },
        }),

      null,
    );

  return {
    id: row.id,

    slug:
      row.slug,

    name:
      row.name,

    bio:
      row.bio,

    about:
      row.about,

    socialLinks:
      (row.socialLinks ??
        {}) as Record<
        string,
        string
      >,

    avatarUrl:
      await resolveAssetUrl(
        row.avatar,
      ),

    bannerUrl:
      await resolveAssetUrl(
        row.banner,
      ),

    websiteUrl:
      row.websiteUrl,

    isVerified:
      row.isVerified,

    contentCount:
      row.contentCount,

    totalViews:
      row.totalViews,

    joinedAt:
      row.startedAt ??
      first?.publishedAt ??
      null,

    seoTitle:
      row.seoTitle,

    seoDescription:
      row.seoDescription,
  };
}

/**
 * Trending page.
 *
 * Ranked by view velocity using the recent view log.
 */
async function rankTrending(
  filters: DiscoveryFilters,
  perPage: number,
): Promise<
  Paginated<ContentCardModel> | null
> {
  const {
    getTrendingContent,
  } = await import(
    "./analytics-service"
  );

  /**
   * Bounded trending pool.
   */
  const pool =
    await getTrendingContent(
      7,
      Math.min(
        perPage * 5,
        100,
      ),
    );

  if (
    pool.length === 0
  ) {
    return null;
  }

  const matching =
    pool.filter(
      (item) => {
        if (
          filters.category &&
          item.category
            ?.slug !==
            filters.category
        ) {
          return false;
        }

        if (
          filters.creator &&
          item.creator
            ?.slug !==
            filters.creator
        ) {
          return false;
        }

        if (
          filters.featuredOnly &&
          !item.isFeatured
        ) {
          return false;
        }

        return true;
      },
    );

  const total =
    matching.length;

  const totalPages =
    Math.ceil(
      total / perPage,
    );

  const page =
    totalPages > 0
      ? Math.min(
          filters.page,
          totalPages,
        )
      : 1;

  return {
    items:
      matching.slice(
        (page - 1) *
          perPage,

        page * perPage,
      ),

    page,

    perPage,

    total,

    totalPages,

    hasMore:
      page <
      totalPages,
  };
}