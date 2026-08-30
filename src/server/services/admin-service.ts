import "server-only";

import type {
  ContentStatus,
  Prisma,
  ReportReason,
  ReportStatus,
  UserRole,
} from "@prisma/client";

import { db } from "@/lib/db";
import { PAGE_SIZE } from "@/config/pagination";
import { resolveAssetUrl } from "@/lib/media";
import type { AdminListParams } from "@/validation/admin";

/**
 * Read queries for the admin panel.
 *
 * Every listing is paginated server-side and selects only the columns the
 * table actually renders — an admin view must never pull thousands of rows,
 * and must never select a password hash it has no use for.
 */

export type Paged<T> = {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

function paginate<T>(
  items: T[],
  total: number,
  page: number,
  perPage: number,
): Paged<T> {
  return {
    items,
    page,
    perPage,
    total,
    totalPages: Math.ceil(total / perPage),
  };
}

const ADMIN_PAGE = PAGE_SIZE.admin;

// ---------------------------------------------------------------- dashboard

/**
 * Dashboard metrics.
 *
 * Every figure is a real aggregate. Nothing here is estimated or invented —
 * a metric the database cannot answer is simply not shown.
 */
export async function getDashboardMetrics() {
  const [
    totalContent,
    publishedContent,
    draftContent,
    archivedContent,
    featuredContent,
    totalCreators,
    totalCategories,
    totalTags,
    totalUsers,
    activeUsers,
    openReports,
    viewAggregate,
    failedProcessing,
  ] = await db.$transaction([
    db.content.count(),
    db.content.count({
      where: {
        status: "PUBLISHED",
      },
    }),
    db.content.count({
      where: {
        status: "DRAFT",
      },
    }),
    db.content.count({
      where: {
        status: "ARCHIVED",
      },
    }),
    db.content.count({
      where: {
        isFeatured: true,
        status: "PUBLISHED",
      },
    }),
    db.creator.count({
      where: {
        isActive: true,
      },
    }),
    db.category.count({
      where: {
        isActive: true,
      },
    }),
    db.tag.count(),
    db.user.count(),
    db.user.count({
      where: {
        isActive: true,
      },
    }),
    db.report.count({
      where: {
        status: {
          in: ["OPEN", "IN_REVIEW"],
        },
      },
    }),
    db.content.aggregate({
      _sum: {
        viewCount: true,
      },
    }),
    db.content.count({
      where: {
        processingStatus: "FAILED",
      },
    }),
  ]);

  return {
    totalContent,
    publishedContent,
    draftContent,
    archivedContent,
    featuredContent,
    totalCreators,
    totalCategories,
    totalTags,
    totalUsers,
    activeUsers,
    suspendedUsers: totalUsers - activeUsers,
    openReports,
    totalViews: viewAggregate._sum.viewCount ?? 0,
    failedProcessing,
  };
}

export type DashboardActivity = {
  recentContent: Array<{
    id: string;
    title: string;
    status: ContentStatus;
    createdAt: Date;
    creator: {
      name: string;
    } | null;
  }>;

  recentUsers: Array<{
    id: string;
    displayName: string;
    username: string;
    createdAt: Date;
    isActive: boolean;
  }>;

  recentReports: Array<{
    id: string;
    reason: ReportReason;
    status: ReportStatus;
    createdAt: Date;
    targetId: string;
  }>;

  popularContent: Array<{
    id: string;
    title: string;
    viewCount: number;
    slug: string;
  }>;
};

/**
 * Recent activity for the dashboard.
 *
 * The return type is declared explicitly rather than inferred: inference
 * through `$transaction` degrades to `any`, which then propagates as an
 * implicit-any into every `.map()` at the call site and fails the build under
 * `strict`.
 */
export async function getDashboardActivity(): Promise<DashboardActivity> {
  const [
    recentContent,
    recentUsers,
    recentReports,
    popularContent,
  ] = await db.$transaction([
    db.content.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 6,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        creator: {
          select: {
            name: true,
          },
        },
      },
    }),

    db.user.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 6,

      // Deliberately narrow: no password hash, no tokens.
      select: {
        id: true,
        displayName: true,
        username: true,
        createdAt: true,
        isActive: true,
      },
    }),

    db.report.findMany({
      where: {
        status: {
          in: ["OPEN", "IN_REVIEW"],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 6,
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
        targetId: true,
      },
    }),

    db.content.findMany({
      where: {
        status: "PUBLISHED",
      },
      orderBy: {
        viewCount: "desc",
      },
      take: 6,
      select: {
        id: true,
        title: true,
        viewCount: true,
        slug: true,
      },
    }),
  ]);

  return {
    recentContent,
    recentUsers,
    recentReports,
    popularContent,
  };
}

// ---------------------------------------------------------------- content

function contentOrder(
  sort: AdminListParams["sort"],
): Prisma.ContentOrderByWithRelationInput {
  switch (sort) {
    case "oldest":
      return {
        createdAt: "asc",
      };

    case "title":
      return {
        title: "asc",
      };

    case "views":
      return {
        viewCount: "desc",
      };

    case "updated":
      return {
        updatedAt: "desc",
      };

    default:
      return {
        createdAt: "desc",
      };
  }
}

/**
 * List content for the admin panel.
 *
 * Thumbnail URLs are resolved through the media storage provider.
 *
 * This matters for local storage because MediaAsset.url is normally null
 * while objectKey contains the actual stored filesystem object.
 */
export async function listAdminContent(
  params: AdminListParams,
) {
  const where: Prisma.ContentWhereInput = {
    ...(params.status
      ? {
          status:
            params.status as Prisma.EnumContentStatusFilter["equals"],
        }
      : {}),

    ...(params.q
      ? {
          OR: [
            {
              title: {
                contains: params.q,
                mode: "insensitive",
              },
            },
            {
              slug: {
                contains: params.q,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const [
    total,
    items,
  ] = await db.$transaction([
    db.content.count({
      where,
    }),

    db.content.findMany({
      where,
      orderBy: contentOrder(params.sort),
      skip: (params.page - 1) * ADMIN_PAGE,
      take: ADMIN_PAGE,

      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        isFeatured: true,
        viewCount: true,
        durationSeconds: true,
        processingStatus: true,
        createdAt: true,
        updatedAt: true,

        creator: {
          select: {
            name: true,
          },
        },

        category: {
          select: {
            name: true,
          },
        },

        thumbnail: {
          select: {
            id: true,
            url: true,
            objectKey: true,
            provider: true,
            bucket: true,
            mimeType: true,
            sizeBytes: true,
          },
        },
      },
    }),
  ]);

  /**
   * Local storage assets have url = null.
   *
   * Resolve every thumbnail through the configured media provider so the
   * admin table receives an actual browser-accessible URL.
   */
  const resolvedItems = await Promise.all(
    items.map(async (item) => {
      if (!item.thumbnail) {
        return item;
      }

      const thumbnailUrl = item.thumbnail.objectKey
        ? await resolveAssetUrl(item.thumbnail)
        : item.thumbnail.url;

      return {
        ...item,

        thumbnail: {
          ...item.thumbnail,
          url: thumbnailUrl,
        },
      };
    }),
  );

  return paginate(
    resolvedItems,
    total,
    params.page,
    ADMIN_PAGE,
  );
}

/** Full record for the edit form, including tag links. */
export async function getAdminContent(
  id: string,
) {
  return db.content.findUnique({
    where: {
      id,
    },

    include: {
      tags: {
        select: {
          tagId: true,
        },
      },

      thumbnail: true,

      source: true,

      creator: {
        select: {
          id: true,
          name: true,
        },
      },

      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Option lists for the content form's selects.
 *
 * Capped deliberately. Subjects stay small by nature, but contributors and
 * especially topics grow without bound, and a <select> holding several
 * thousand entries is both a slow query and an unusable control. Topics are
 * ordered by usage so the cap keeps the ones editors actually reach for.
 */
const FORM_OPTION_LIMIT = 500;

export async function getContentFormOptions() {
  const [
    creators,
    categories,
    tags,
  ] = await db.$transaction([
    db.creator.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        name: "asc",
      },
      take: FORM_OPTION_LIMIT,
      select: {
        id: true,
        name: true,
      },
    }),

    db.category.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        position: "asc",
      },
      take: FORM_OPTION_LIMIT,
      select: {
        id: true,
        name: true,
      },
    }),

    db.tag.findMany({
      orderBy: [
        {
          contentCount: "desc",
        },
        {
          name: "asc",
        },
      ],
      take: FORM_OPTION_LIMIT,
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  return {
    creators,
    categories,
    tags,
  };
}

// ---------------------------------------------------------------- creators

export async function listAdminCreators(
  params: AdminListParams,
) {
  const where: Prisma.CreatorWhereInput = params.q
    ? {
        OR: [
          {
            name: {
              contains: params.q,
              mode: "insensitive",
            },
          },
          {
            slug: {
              contains: params.q,
              mode: "insensitive",
            },
          },
        ],
      }
    : {};

  const [
    total,
    items,
  ] = await db.$transaction([
    db.creator.count({
      where,
    }),

    db.creator.findMany({
      where,

      orderBy:
        params.sort === "title"
          ? {
              name: "asc",
            }
          : {
              createdAt: "desc",
            },

      skip: (params.page - 1) * ADMIN_PAGE,
      take: ADMIN_PAGE,

      select: {
        id: true,
        slug: true,
        name: true,
        isVerified: true,
        isActive: true,
        contentCount: true,
        totalViews: true,
        createdAt: true,

        avatar: {
          select: {
            url: true,
            objectKey: true,
            provider: true,
          },
        },
      },
    }),
  ]);

  return paginate(
    items,
    total,
    params.page,
    ADMIN_PAGE,
  );
}

export const getAdminCreator = (
  id: string,
) =>
  db.creator.findUnique({
    where: {
      id,
    },

    include: {
      avatar: true,
      banner: true,
    },
  });

// ---------------------------------------------------------------- taxonomy

export async function listAdminCategories() {
  return db.category.findMany({
    orderBy: [
      {
        position: "asc",
      },
      {
        name: "asc",
      },
    ],

    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      position: true,
      isActive: true,
      contentCount: true,

      parent: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

export const getAdminCategory = (
  id: string,
) =>
  db.category.findUnique({
    where: {
      id,
    },
  });

export async function listAdminTags(
  params: AdminListParams,
) {
  const where: Prisma.TagWhereInput = params.q
    ? {
        name: {
          contains: params.q,
          mode: "insensitive",
        },
      }
    : {};

  const [
    total,
    items,
  ] = await db.$transaction([
    db.tag.count({
      where,
    }),

    db.tag.findMany({
      where,

      orderBy:
        params.sort === "title"
          ? {
              name: "asc",
            }
          : {
              contentCount: "desc",
            },

      skip: (params.page - 1) * ADMIN_PAGE,
      take: ADMIN_PAGE,

      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        contentCount: true,
        createdAt: true,
      },
    }),
  ]);

  return paginate(
    items,
    total,
    params.page,
    ADMIN_PAGE,
  );
}

export const getAdminTag = (
  id: string,
) =>
  db.tag.findUnique({
    where: {
      id,
    },
  });

// ---------------------------------------------------------------- users

export async function listAdminUsers(
  params: AdminListParams,
) {
  const where: Prisma.UserWhereInput = {
    ...(params.status === "suspended"
      ? {
          isActive: false,
        }
      : {}),

    ...(params.status === "active"
      ? {
          isActive: true,
        }
      : {}),

    ...(params.status &&
    ["USER", "MODERATOR", "ADMIN"].includes(
      params.status,
    )
      ? {
          role:
            params.status as
              | "USER"
              | "MODERATOR"
              | "ADMIN",
        }
      : {}),

    ...(params.q
      ? {
          OR: [
            {
              displayName: {
                contains: params.q,
                mode: "insensitive",
              },
            },
            {
              username: {
                contains: params.q,
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: params.q,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const [
    total,
    items,
  ] = await db.$transaction([
    db.user.count({
      where,
    }),

    db.user.findMany({
      where,

      orderBy: {
        createdAt: "desc",
      },

      skip: (params.page - 1) * ADMIN_PAGE,
      take: ADMIN_PAGE,

      // No passwordHash, no tokens — the admin UI has no use for either.
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,

        _count: {
          select: {
            favorites: true,
            history: true,
            reportsFiled: true,
          },
        },
      },
    }),
  ]);

  return paginate(
    items,
    total,
    params.page,
    ADMIN_PAGE,
  );
}

export type AdminUserDetail = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  role: UserRole;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  lastLoginAt: Date | null;

  _count: {
    favorites: number;
    history: number;
    reportsFiled: number;
  };

  reportsFiled: Array<{
    id: string;
    reason: ReportReason;
    status: ReportStatus;
    createdAt: Date;
    targetId: string;
  }>;
};

/** Explicit return type: the nested `reportsFiled` array is mapped in the UI. */
export async function getAdminUser(
  id: string,
): Promise<AdminUserDetail | null> {
  return db.user.findUnique({
    where: {
      id,
    },

    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      role: true,
      isActive: true,
      emailVerifiedAt: true,
      createdAt: true,
      lastLoginAt: true,

      _count: {
        select: {
          favorites: true,
          history: true,
          reportsFiled: true,
        },
      },

      reportsFiled: {
        orderBy: {
          createdAt: "desc",
        },

        take: 10,

        select: {
          id: true,
          reason: true,
          status: true,
          createdAt: true,
          targetId: true,
        },
      },
    },
  });
}

// ---------------------------------------------------------------- reports

export async function listAdminReports(
  params: AdminListParams,
) {
  const where: Prisma.ReportWhereInput = params.status
    ? {
        status:
          params.status as Prisma.EnumReportStatusFilter["equals"],
      }
    : {};

  const [
    total,
    items,
  ] = await db.$transaction([
    db.report.count({
      where,
    }),

    db.report.findMany({
      where,

      orderBy: {
        createdAt: "desc",
      },

      skip: (params.page - 1) * ADMIN_PAGE,
      take: ADMIN_PAGE,

      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        status: true,
        createdAt: true,

        author: {
          select: {
            id: true,
            displayName: true,
            username: true,
          },
        },

        handler: {
          select: {
            displayName: true,
          },
        },
      },
    }),
  ]);

  return paginate(
    items,
    total,
    params.page,
    ADMIN_PAGE,
  );
}

/** Report plus the content it points at, resolved for review. */
/** Explicit return type so the report and its resolved target stay typed. */
export async function getAdminReport(
  id: string,
) {
  const report = await db.report.findUnique({
    where: {
      id,
    },

    include: {
      author: {
        select: {
          id: true,
          displayName: true,
          username: true,
          email: true,
        },
      },

      handler: {
        select: {
          displayName: true,
        },
      },
    },
  });

  if (!report) {
    return null;
  }

  const target =
    report.targetType === "CONTENT"
      ? await db.content.findUnique({
          where: {
            id: report.targetId,
          },

          select: {
            id: true,
            slug: true,
            title: true,
            status: true,
          },
        })
      : null;

  return {
    report,
    target,
  };
}

// ---------------------------------------------------------------- media

export async function listAdminMedia(
  params: AdminListParams,
) {
  const where: Prisma.MediaAssetWhereInput = {
    ...(params.status
      ? {
          kind:
            params.status as Prisma.EnumMediaKindFilter["equals"],
        }
      : {}),

    ...(params.q
      ? {
          objectKey: {
            contains: params.q,
            mode: "insensitive",
          },
        }
      : {}),
  };

  const [
    total,
    items,
  ] = await db.$transaction([
    db.mediaAsset.count({
      where,
    }),

    db.mediaAsset.findMany({
      where,

      orderBy: {
        createdAt: "desc",
      },

      skip: (params.page - 1) * ADMIN_PAGE,
      take: ADMIN_PAGE,

      select: {
        id: true,
        kind: true,
        provider: true,
        objectKey: true,
        url: true,
        mimeType: true,
        sizeBytes: true,
        width: true,
        height: true,
        durationSeconds: true,
        createdAt: true,

        // Reference counts decide whether an asset is safe to delete.
        _count: {
          select: {
            thumbnailFor: true,
            sourceFor: true,
            creatorAvatars: true,
          },
        },
      },
    }),
  ]);

  return paginate(
    items,
    total,
    params.page,
    ADMIN_PAGE,
  );
}

// ---------------------------------------------------------------- search

/**
 * Cross-entity admin search.
 * Database queries only, no client-side index.
 */
export async function adminGlobalSearch(
  query: string,
) {
  if (query.trim().length < 2) {
    return {
      content: [],
      creators: [],
      users: [],
      categories: [],
      tags: [],
    };
  }

  const contains = {
    contains: query,
    mode: "insensitive" as const,
  };

  const [
    content,
    creators,
    users,
    categories,
    tags,
  ] = await db.$transaction([
    db.content.findMany({
      where: {
        title: contains,
      },
      take: 5,

      select: {
        id: true,
        title: true,
        status: true,
      },
    }),

    db.creator.findMany({
      where: {
        name: contains,
      },
      take: 5,

      select: {
        id: true,
        name: true,
      },
    }),

    db.user.findMany({
      where: {
        OR: [
          {
            displayName: contains,
          },
          {
            username: contains,
          },
          {
            email: contains,
          },
        ],
      },

      take: 5,

      select: {
        id: true,
        displayName: true,
        username: true,
      },
    }),

    db.category.findMany({
      where: {
        name: contains,
      },

      take: 5,

      select: {
        id: true,
        name: true,
      },
    }),

    db.tag.findMany({
      where: {
        name: contains,
      },

      take: 5,

      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  return {
    content,
    creators,
    users,
    categories,
    tags,
  };
}