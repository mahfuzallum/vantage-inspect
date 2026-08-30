import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { toCategorySummary, toTagSummary } from "@/server/mappers/content-mapper";
import type { CategorySummary, TagSummary } from "@/types/content";

/** Top-level subject areas, ordered by the position column. */
export const listCategories = unstable_cache(
  async (): Promise<CategorySummary[]> => {
    const rows = await db.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    return rows.map(toCategorySummary).filter((row): row is CategorySummary => row !== null);
  },
  ["categories"],
  { revalidate: 600, tags: ["taxonomy"] },
);

export async function getCategoryBySlug(slug: string) {
  return db.category.findUnique({
    where: { slug },
    include: { children: { where: { isActive: true }, orderBy: { position: "asc" } } },
  });
}

export const listPopularTags = unstable_cache(
  async (limit = 40): Promise<TagSummary[]> => {
    const rows = await db.tag.findMany({
      where: { contentCount: { gt: 0 } },
      orderBy: { contentCount: "desc" },
      take: limit,
    });
    return rows.map(toTagSummary);
  },
  ["popular-tags"],
  { revalidate: 600, tags: ["taxonomy"] },
);

export async function getTagBySlug(slug: string) {
  return db.tag.findUnique({ where: { slug } });
}

/**
 * Keeps denormalised counters honest. Called after publish/unpublish and by
 * a nightly job; cheap enough to run inline.
 */
export async function recountTaxonomy(): Promise<void> {
  await db.$executeRaw`
    UPDATE categories c
    SET content_count = sub.total
    FROM (
      SELECT category_id, COUNT(*)::int AS total
      FROM content WHERE status = 'PUBLISHED' AND category_id IS NOT NULL
      GROUP BY category_id
    ) sub
    WHERE c.id = sub.category_id`;

  await db.$executeRaw`
    UPDATE tags t
    SET content_count = sub.total
    FROM (
      SELECT ct.tag_id, COUNT(*)::int AS total
      FROM content_tags ct
      JOIN content c ON c.id = ct.content_id AND c.status = 'PUBLISHED'
      GROUP BY ct.tag_id
    ) sub
    WHERE t.id = sub.tag_id`;
}
