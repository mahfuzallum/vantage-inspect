import type { MetadataRoute } from "next";
import { db, safeQuery } from "@/lib/db";
import { siteConfig } from "@/config/site";
import { routes } from "@/config/routes";

export const revalidate = 3600;

/**
 * Static routes plus every published slug. For catalogues beyond ~50k URLs
 * this should be split into a sitemap index with generateSitemaps().
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = (path: string) => `${siteConfig.url}${path}`;

  const staticEntries: MetadataRoute.Sitemap = [
    { url: url(routes.home), changeFrequency: "daily", priority: 1 },
    { url: url(routes.latest), changeFrequency: "hourly", priority: 0.9 },
    { url: url(routes.popular), changeFrequency: "daily", priority: 0.8 },
    { url: url(routes.featured), changeFrequency: "daily", priority: 0.8 },
    { url: url(routes.categories), changeFrequency: "weekly", priority: 0.7 },
    { url: url(routes.creators), changeFrequency: "weekly", priority: 0.7 },
    { url: url(routes.tags), changeFrequency: "weekly", priority: 0.5 },
  ];

  const [content, creators, categories, tags] = await Promise.all([
    safeQuery(
      () =>
        db.content.findMany({
          where: { status: "PUBLISHED" },
          select: { slug: true, updatedAt: true },
          orderBy: { publishedAt: "desc" },
          take: 40_000,
        }),
      [],
    ),
    safeQuery(
      () =>
        db.creator.findMany({
          where: { isActive: true, contentCount: { gt: 0 } },
          select: { slug: true, updatedAt: true },
        }),
      [],
    ),
    safeQuery(
      () =>
        db.category.findMany({
          where: { isActive: true },
          select: { slug: true, updatedAt: true },
        }),
      [],
    ),
    safeQuery(
      () =>
        db.tag.findMany({
          where: { contentCount: { gt: 0 } },
          select: { slug: true, updatedAt: true },
          take: 5_000,
        }),
      [],
    ),
  ]);

  return [
    ...staticEntries,
    ...content.map((row) => ({
      url: url(routes.content(row.slug)),
      lastModified: row.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...creators.map((row) => ({
      url: url(routes.creator(row.slug)),
      lastModified: row.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...categories.map((row) => ({
      url: url(routes.category(row.slug)),
      lastModified: row.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...tags.map((row) => ({
      url: url(routes.tag(row.slug)),
      lastModified: row.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];
}
