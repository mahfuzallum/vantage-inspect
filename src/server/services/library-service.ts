import "server-only";

import { revalidateTag } from "next/cache";

import { db } from "@/lib/db";
import { PAGE_SIZE } from "@/config/pagination";

import {
  contentCardInclude,
  toContentCards,
} from "@/server/mappers/content-mapper";

import type {
  ContentCardModel,
  Paginated,
} from "@/types/content";

/**
 * Toggle a saved item.
 *
 * Returns the new state so the UI can update optimistically.
 */
export async function toggleFavorite(
  userId: string,
  contentId: string,
): Promise<boolean> {
  const existing =
    await db.favorite.findUnique({
      where: {
        userId_contentId: {
          userId,
          contentId,
        },
      },
      select: {
        id: true,
      },
    });

  if (existing) {
    await db.$transaction([
      db.favorite.delete({
        where: {
          id: existing.id,
        },
      }),

      db.content.update({
        where: {
          id: contentId,
        },
        data: {
          favoriteCount: {
            decrement: 1,
          },
        },
      }),
    ]);

    revalidateTag("content");

    return false;
  }

  await db.$transaction([
    db.favorite.create({
      data: {
        userId,
        contentId,
      },
    }),

    db.content.update({
      where: {
        id: contentId,
      },
      data: {
        favoriteCount: {
          increment: 1,
        },
      },
    }),
  ]);

  revalidateTag("content");

  return true;
}

/**
 * List the user's favourites.
 */
export async function listFavorites(
  userId: string,
  page: number = 1,
  perPage: number = PAGE_SIZE.grid,
): Promise<
  Paginated<ContentCardModel>
> {
  const [
    total,
    rows,
  ] = await db.$transaction([
    db.favorite.count({
      where: {
        userId,
      },
    }),

    db.favorite.findMany({
      where: {
        userId,
      },

      orderBy: {
        createdAt: "desc",
      },

      skip:
        (page - 1) *
        perPage,

      take:
        perPage,

      include: {
        content: {
          include:
            contentCardInclude,
        },
      },
    }),
  ]);

  const totalPages =
    Math.ceil(
      total / perPage,
    );

  const contentRows =
    rows.map(
      (row) =>
        row.content,
    );

  return {
    items:
      await toContentCards(
        contentRows,
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

/**
 * Upsert the resume point.
 *
 * Respects the user's keepHistory preference.
 */
export async function recordProgress(
  userId: string,
  contentId: string,
  progressSeconds: number,
  completed = false,
): Promise<void> {
  const preference =
    await db.userPreference.findUnique({
      where: {
        userId,
      },

      select: {
        keepHistory: true,
      },
    });

  if (
    preference &&
    !preference.keepHistory
  ) {
    return;
  }

  await db.viewingHistory.upsert({
    where: {
      userId_contentId: {
        userId,
        contentId,
      },
    },

    create: {
      userId,
      contentId,
      progressSeconds,
      completed,
    },

    update: {
      progressSeconds,
      completed,
      lastViewedAt:
        new Date(),

      viewCount: {
        increment: 1,
      },
    },
  });
}

/**
 * A single viewing-history entry.
 */
export type HistoryEntry = {
  content: ContentCardModel;
  lastViewedAt: Date;
  progressSeconds: number;
  completed: boolean;
};

/**
 * History with per-entry metadata.
 *
 * Always paginated and newest first.
 */
export async function getViewingHistory(
  userId: string,
  page: number = 1,
  perPage: number = PAGE_SIZE.grid,
): Promise<
  Paginated<HistoryEntry>
> {
  const [
    total,
    rows,
  ] = await db.$transaction([
    db.viewingHistory.count({
      where: {
        userId,
      },
    }),

    db.viewingHistory.findMany({
      where: {
        userId,
      },

      orderBy: {
        lastViewedAt: "desc",
      },

      skip:
        (page - 1) *
        perPage,

      take:
        perPage,

      include: {
        content: {
          include:
            contentCardInclude,
        },
      },
    }),
  ]);

  const cards =
    await toContentCards(
      rows.map(
        (row) =>
          row.content,
      ),
    );

  const items: HistoryEntry[] =
    rows.flatMap(
      (row, index) => {
        const content =
          cards[index];

        if (!content) {
          return [];
        }

        return [
          {
            content,

            lastViewedAt:
              row.lastViewedAt,

            progressSeconds:
              row.progressSeconds,

            completed:
              row.completed,
          },
        ];
      },
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
}

/**
 * List history as ordinary content cards.
 */
export async function listHistory(
  userId: string,
  page: number = 1,
  perPage: number = PAGE_SIZE.grid,
): Promise<
  Paginated<ContentCardModel>
> {
  const [
    total,
    rows,
  ] = await db.$transaction([
    db.viewingHistory.count({
      where: {
        userId,
      },
    }),

    db.viewingHistory.findMany({
      where: {
        userId,
      },

      orderBy: {
        lastViewedAt: "desc",
      },

      skip:
        (page - 1) *
        perPage,

      take:
        perPage,

      include: {
        content: {
          include:
            contentCardInclude,
        },
      },
    }),
  ]);

  const totalPages =
    Math.ceil(
      total / perPage,
    );

  return {
    items:
      await toContentCards(
        rows.map(
          (row) =>
            row.content,
        ),
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

/**
 * Remove the complete viewing history.
 */
export async function clearViewingHistory(
  userId: string,
): Promise<void> {
  await db.viewingHistory.deleteMany({
    where: {
      userId,
    },
  });
}

/**
 * Kept for existing callers.
 */
export const clearHistory =
  clearViewingHistory;

/**
 * Remove one history item.
 *
 * The operation is scoped by userId.
 */
export async function removeHistoryItem(
  userId: string,
  contentId: string,
): Promise<void> {
  await db.viewingHistory.deleteMany({
    where: {
      userId,
      contentId,
    },
  });
}

/**
 * Window inside which repeat views update the existing row
 * without increasing the visit counter.
 */
const HISTORY_DEDUPE_MINUTES =
  30;

/**
 * Records that a reader opened something.
 *
 * One row per (user, content) is enforced by the unique constraint.
 *
 * Within the dedupe window:
 *   - refresh timestamp
 *   - update progress
 *   - do not increment visit counter
 *
 * Outside the dedupe window:
 *   - refresh timestamp
 *   - update progress
 *   - increment visit counter
 *
 * History failures never break playback.
 */
export async function recordViewingHistory(
  userId: string,
  contentId: string,
  progressSeconds = 0,
): Promise<void> {
  try {
    const preference =
      await db.userPreference.findUnique({
        where: {
          userId,
        },

        select: {
          keepHistory: true,
        },
      });

    if (
      preference &&
      !preference.keepHistory
    ) {
      return;
    }

    const existing =
      await db.viewingHistory.findUnique({
        where: {
          userId_contentId: {
            userId,
            contentId,
          },
        },

        select: {
          id: true,
          lastViewedAt: true,
        },
      });

    if (!existing) {
      await db.viewingHistory.create({
        data: {
          userId,
          contentId,
          progressSeconds,
        },
      });

      return;
    }

    const withinWindow =
      Date.now() -
        existing.lastViewedAt.getTime() <
      HISTORY_DEDUPE_MINUTES *
        60_000;

    await db.viewingHistory.update({
      where: {
        id: existing.id,
      },

      data: {
        lastViewedAt:
          new Date(),

        ...(progressSeconds >
        0
          ? {
              progressSeconds,
            }
          : {}),

        ...(withinWindow
          ? {}
          : {
              viewCount: {
                increment: 1,
              },
            }),
      },
    });
  } catch (error) {
    console.error(
      "[history] record failed (ignored):",
      error,
    );
  }
}

/**
 * Return favourite IDs for a set of content IDs.
 */
export async function favoriteIdsFor(
  userId: string,
  contentIds: string[],
): Promise<Set<string>> {
  if (
    contentIds.length === 0
  ) {
    return new Set();
  }

  const rows =
    await db.favorite.findMany({
      where: {
        userId,

        contentId: {
          in: contentIds,
        },
      },

      select: {
        contentId: true,
      },
    });

  return new Set(
    rows.map(
      (row) =>
        row.contentId,
    ),
  );
}