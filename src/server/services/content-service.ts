import "server-only";

import type { Prisma } from "@prisma/client";

import { db, safeQuery } from "@/lib/db";
import { PAGE_SIZE } from "@/config/pagination";
import {
  DEFAULT_SORT,
  type SortOption,
} from "@/config/filters";

import {
  contentCardInclude,
  contentDetailInclude,
  toContentCards,
  toContentDetail,
} from "@/server/mappers/content-mapper";

import type {
  ContentCardModel,
  ContentDetailModel,
  Paginated,
} from "@/types/content";

import type { ContentFilterInput } from "@/validation/content";

/**
 * Public content must always be published and have a publication date.
 */
const PUBLISHED: Prisma.ContentWhereInput = {
  status: "PUBLISHED",
  publishedAt: {
    not: null,
  },
};

export type ListContentInput = {
  page?: number;
  perPage?: number;

  sort?: SortOption;

  q?: string;
  query?: string;

  category?: string;
  tag?: string;
  creator?: string;

  categorySlug?: string;
  tagSlug?: string;
  creatorSlug?: string;

  kind?:
    | "VIDEO"
    | "AUDIO"
    | "IMAGE"
    | "DOCUMENT";

  minDuration?: number;
  maxDuration?: number;

  featuredOnly?: boolean;
};

/**
 * Normalize all supported listing input shapes.
 */
function normalizeListInput(
  input: ListContentInput,
) {
  return {
    page: Math.max(
      1,
      input.page ?? 1,
    ),

    perPage: Math.min(
      100,
      Math.max(
        1,
        input.perPage ??
          PAGE_SIZE.grid,
      ),
    ),

    sort:
      input.sort ??
      DEFAULT_SORT,

    query: (
      input.q ??
      input.query ??
      ""
    ).trim(),

    categorySlug:
      input.categorySlug ??
      input.category,

    tagSlug:
      input.tagSlug ??
      input.tag,

    creatorSlug:
      input.creatorSlug ??
      input.creator,

    kind: input.kind,

    minDuration:
      input.minDuration,

    maxDuration:
      input.maxDuration,

    featuredOnly:
      input.featuredOnly,
  };
}

/**
 * Build the Prisma WHERE clause for public listings.
 */
function buildWhere(
  input: ReturnType<
    typeof normalizeListInput
  >,
): Prisma.ContentWhereInput {
  const where: Prisma.ContentWhereInput =
    {
      ...PUBLISHED,
    };

  if (input.categorySlug) {
    where.category = {
      slug: input.categorySlug,
    };
  }

  if (input.tagSlug) {
    where.tags = {
      some: {
        tag: {
          slug: input.tagSlug,
        },
      },
    };
  }

  if (input.creatorSlug) {
    where.creator = {
      slug: input.creatorSlug,
    };
  }

  if (input.kind) {
    where.kind = input.kind;
  }

  if (input.featuredOnly) {
    where.isFeatured = true;
  }

  if (
    typeof input.minDuration ===
    "number"
  ) {
    where.durationSeconds = {
      ...(typeof input.maxDuration ===
      "number"
        ? {
            lte: input.maxDuration,
          }
        : {}),
      gte: input.minDuration,
    };
  } else if (
    typeof input.maxDuration ===
    "number"
  ) {
    where.durationSeconds = {
      lte: input.maxDuration,
    };
  }

  if (
    input.query.length >= 2
  ) {
    where.OR = [
      {
        title: {
          contains:
            input.query,
          mode: "insensitive",
        },
      },
      {
        summary: {
          contains:
            input.query,
          mode: "insensitive",
        },
      },
    ];
  }

  return where;
}

/**
 * Standard database ordering for public listings.
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

    case "longest":
      return [
        {
          durationSeconds:
            "desc",
        },
        {
          publishedAt: "desc",
        },
      ];

    case "shortest":
      return [
        {
          durationSeconds:
            "asc",
        },
        {
          publishedAt: "desc",
        },
      ];

    case "trending":
      return [
        {
          publishedAt: "desc",
        },
        {
          viewCount: "desc",
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
 * Main public listing function.
 */
export async function listContent(
  input: ListContentInput,
): Promise<
  Paginated<ContentCardModel>
> {
  const filters =
    normalizeListInput(
      input,
    );

  const where =
    buildWhere(filters);

  const [
    total,
    rows,
  ] = await db.$transaction([
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
        (filters.page - 1) *
        filters.perPage,

      take:
        filters.perPage,

      include:
        contentCardInclude,
    }),
  ]);

  const totalPages =
    Math.ceil(
      total /
        filters.perPage,
    );

  return {
    items:
      await toContentCards(
        rows,
      ),

    page:
      filters.page,

    perPage:
      filters.perPage,

    total,

    totalPages,

    hasMore:
      filters.page <
      totalPages,
  };
}

/**
 * Compatibility helper for callers using the Zod filter type.
 */
export async function listContentFromFilters(
  filters: ContentFilterInput,
): Promise<
  Paginated<ContentCardModel>
> {
  return listContent({
    page: filters.page,

    perPage:
      filters.perPage,

    sort:
      filters.sort as SortOption,

    q: filters.q,

    category:
      filters.category,

    tag:
      filters.tag,

    creator:
      filters.creator,

    kind:
      filters.kind,

    minDuration:
      filters.minDuration,

    maxDuration:
      filters.maxDuration,
  });
}

/**
 * Fetch one content item by slug.
 *
 * Public callers receive published content only.
 * Staff preview can explicitly include unpublished content.
 */
export async function getContentBySlug(
  slug: string,
  includeUnpublished = false,
): Promise<
  ContentDetailModel | null
> {
  const row =
    await db.content.findFirst({
      where: includeUnpublished
        ? {
            slug,
          }
        : {
            slug,
            ...PUBLISHED,
          },

      include:
        contentDetailInclude,
    });

  if (!row) {
    return null;
  }

  return toContentDetail(
    row,
    includeUnpublished,
  );
}

/**
 * Fetch published cards by IDs while preserving the supplied order.
 */
export async function getContentByIds(
  ids: string[],
): Promise<
  ContentCardModel[]
> {
  if (ids.length === 0) {
    return [];
  }

  const uniqueIds =
    Array.from(
      new Set(ids),
    );

  const rows =
    await db.content.findMany({
      where: {
        ...PUBLISHED,

        id: {
          in: uniqueIds,
        },
      },

      include:
        contentCardInclude,
    });

  const byId =
    new Map(
      rows.map(
        (row) => [
          row.id,
          row,
        ],
      ),
    );

  const ordered =
    uniqueIds
      .map((id) =>
        byId.get(id),
      )
      .filter(
        (
          row,
        ): row is NonNullable<
          typeof row
        > =>
          Boolean(row),
      );

  return toContentCards(
    ordered,
  );
}

/**
 * Related content.
 *
 * Priority:
 * 1. Same creator
 * 2. Shared tags
 * 3. Same category
 */
export async function getRelatedContent(
  content: ContentDetailModel,
  limit = 8,
): Promise<
  ContentCardModel[]
> {
  if (limit <= 0) {
    return [];
  }

  const collected =
    new Map<
      string,
      ContentCardModel
    >();

  async function take(
    where: Prisma.ContentWhereInput,
    orderBy:
      | Prisma.ContentOrderByWithRelationInput
      | Prisma.ContentOrderByWithRelationInput[],
  ): Promise<void> {
    if (
      collected.size >=
      limit
    ) {
      return;
    }

    const rows =
      await db.content.findMany({
        where: {
          ...PUBLISHED,

          ...where,

          id: {
            not: content.id,
          },
        },

        orderBy,

        take: Math.max(
          limit * 2,
          12,
        ),

        include:
          contentCardInclude,
      });

    const cards =
      await toContentCards(
        rows,
      );

    for (
      const card of cards
    ) {
      if (
        collected.size >=
        limit
      ) {
        break;
      }

      if (
        !collected.has(
          card.id,
        )
      ) {
        collected.set(
          card.id,
          card,
        );
      }
    }
  }

  /**
   * Tier 1:
   * Same creator.
   */
  if (content.creator) {
    await take(
      {
        creatorId:
          content.creator.id,
      },
      {
        publishedAt:
          "desc",
      },
    );
  }

  /**
   * Tier 2:
   * Shared tags.
   */
  const tagIds =
    content.tags?.map(
      (tag) => tag.id,
    ) ?? [];

  if (
    tagIds.length > 0
  ) {
    await take(
      {
        tags: {
          some: {
            tagId: {
              in: tagIds,
            },
          },
        },
      },
      {
        viewCount:
          "desc",
      },
    );
  }

  /**
   * Tier 3:
   * Same category.
   */
  if (content.category) {
    await take(
      {
        categoryId:
          content.category.id,
      },
      [
        {
          viewCount:
            "desc",
        },
        {
          publishedAt:
            "desc",
        },
      ],
    );
  }

  return Array.from(
    collected.values(),
  ).slice(0, limit);
}

/**
 * Home page sections.
 */
export async function getHomeSections(): Promise<{
  featured: ContentCardModel[];
  latest: ContentCardModel[];
  popular: ContentCardModel[];
}> {
  const [
    featuredRows,
    latestRows,
    popularRows,
  ] = await Promise.all([
    db.content.findMany({
      where: {
        ...PUBLISHED,
        isFeatured: true,
      },

      orderBy: {
        publishedAt:
          "desc",
      },

      take: 12,

      include:
        contentCardInclude,
    }),

    db.content.findMany({
      where: PUBLISHED,

      orderBy: {
        publishedAt:
          "desc",
      },

      take: 12,

      include:
        contentCardInclude,
    }),

    db.content.findMany({
      where: PUBLISHED,

      orderBy: [
        {
          viewCount:
            "desc",
        },
        {
          publishedAt:
            "desc",
        },
      ],

      take: 12,

      include:
        contentCardInclude,
    }),
  ]);

  const [
    featured,
    latest,
    popular,
  ] = await Promise.all([
    toContentCards(
      featuredRows,
    ),

    toContentCards(
      latestRows,
    ),

    toContentCards(
      popularRows,
    ),
  ]);

  return {
    featured,
    latest,
    popular,
  };
}

/**
 * Fetch a single published detail record by ID.
 */
export async function getContentById(
  id: string,
  includeUnpublished = false,
): Promise<
  ContentDetailModel | null
> {
  const row =
    await db.content.findFirst({
      where: includeUnpublished
        ? {
            id,
          }
        : {
            id,
            ...PUBLISHED,
          },

      include:
        contentDetailInclude,
    });

  if (!row) {
    return null;
  }

  return toContentDetail(
    row,
    includeUnpublished,
  );
}

/**
 * Fetch a single published card by ID.
 */
export async function getContentCardById(
  id: string,
): Promise<
  ContentCardModel | null
> {
  const row =
    await db.content.findFirst({
      where: {
        id,
        ...PUBLISHED,
      },

      include:
        contentCardInclude,
    });

  if (!row) {
    return null;
  }

  const cards =
    await toContentCards(
      [row],
    );

  return cards[0] ??
    null;
}

/**
 * Safe optional slug lookup.
 */
export async function getOptionalContentBySlug(
  slug: string,
): Promise<
  ContentDetailModel | null
> {
  return safeQuery(
    () =>
      getContentBySlug(
        slug,
      ),
    null,
  );
}