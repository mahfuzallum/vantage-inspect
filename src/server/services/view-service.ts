import "server-only";
import { db } from "@/lib/db";

/**
 * Records a view and bumps the denormalised counter.
 * De-duplicated per (content, viewer) inside a short window so a refresh or
 * a seek does not inflate numbers.
 */
const DEDUPE_WINDOW_MINUTES = 30;

export async function recordView(params: {
  contentId: string;
  userId?: string | null;
  sessionKey?: string | null;
  referrer?: string | null;
}): Promise<void> {
  const { contentId, userId, sessionKey, referrer } = params;
  const since = new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60_000);

  const recent = await db.view.findFirst({
    where: {
      contentId,
      createdAt: { gte: since },
      ...(userId ? { userId } : sessionKey ? { sessionKey } : {}),
    },
    select: { id: true },
  });
  if (recent) return;

  await db.$transaction([
    db.view.create({
      data: {
        contentId,
        userId: userId ?? null,
        sessionKey: sessionKey ?? null,
        referrer: referrer ?? null,
      },
    }),
    db.content.update({ where: { id: contentId }, data: { viewCount: { increment: 1 } } }),
  ]);
}

/** Trending = view volume inside a rolling window, not all-time count. */
export async function trendingContentIds(days = 7, limit = 12): Promise<string[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.view.groupBy({
    by: ["contentId"],
    where: { createdAt: { gte: since } },
    _count: { contentId: true },
    orderBy: { _count: { contentId: "desc" } },
    take: limit,
  });
  return rows.map((row) => row.contentId);
}
