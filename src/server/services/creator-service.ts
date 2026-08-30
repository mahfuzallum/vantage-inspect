import "server-only";
import { db } from "@/lib/db";
import { PAGE_SIZE } from "@/config/pagination";
import { toCreatorSummary } from "@/server/mappers/content-mapper";
import type { CreatorSummary, Paginated } from "@/types/content";

export async function getCreatorBySlug(slug: string) {
  return db.creator.findFirst({
    where: { slug, isActive: true },
    include: { avatar: true, banner: true },
  });
}

export async function listCreators(
  page: number = 1,
  perPage: number = PAGE_SIZE.grid,
): Promise<Paginated<CreatorSummary>> {
  const where = { isActive: true, contentCount: { gt: 0 } };

  const [total, rows] = await db.$transaction([
    db.creator.count({ where }),
    db.creator.findMany({
      where,
      orderBy: [{ totalViews: "desc" }, { name: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: { avatar: true },
    }),
  ]);

  const items = (await Promise.all(rows.map(toCreatorSummary))).filter(
    (row): row is CreatorSummary => row !== null,
  );
  const totalPages = Math.ceil(total / perPage);

  return { items, page, perPage, total, totalPages, hasMore: page < totalPages };
}
