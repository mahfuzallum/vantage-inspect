import "server-only";
import { db, safeQuery } from "@/lib/db";
import { resolveAssetUrl } from "@/lib/media";
import type { SidebarCreator } from "@/components/home/home-sidebar";
import { getContentByIds, getHomeSections } from "./content-service";
import { listCategories } from "./taxonomy-service";
import { listCreators } from "./creator-service";
import { getSettings, HOME_DEFAULTS } from "./settings-service";
import { queryMockContent, queryMockCreators } from "@/lib/mock/query";
import { mockCategories } from "@/lib/mock/catalogue";
import { DEFAULT_SORT } from "@/config/filters";
import type { CategorySummary, ContentCardModel, CreatorSummary } from "@/types/content";
import type { DiscoveryFilters } from "@/types/discovery";

/** Published and dated — the same gate the public listings use. */
const publishedContentFilter = { status: "PUBLISHED", publishedAt: { not: null } } as const;

export type HomeCopy = {
  heroTitle: string;
  heroDescription: string;
  quickLinks: string[];
};

export type TickerEntry = {
  id: string;
  title: string;
  slug: string;
  creatorName: string | null;
  /** ISO timestamp — serialises cleanly to the client strip. */
  addedAt: string;
};

export type HomeData = {
  copy: HomeCopy;
  /** Newest additions, for the live strip under the hero. */
  ticker: TickerEntry[];
  featured: ContentCardModel[];
  latest: ContentCardModel[];
  popular: ContentCardModel[];
  categories: CategorySummary[];
  creators: CreatorSummary[];
  /** True when the page is rendering the demo catalogue instead of real rows. */
  isDemo: boolean;
};

/** Base filter set for a demo rail: one page, no narrowing. */
const demoFilters = (overrides: Partial<DiscoveryFilters> = {}): DiscoveryFilters => ({
  query: "",
  sort: DEFAULT_SORT,
  page: 1,
  perPage: 12,
  ...overrides,
});

/**
 * Assembles everything the home page needs in one place.
 *
 * A fresh checkout has no rows, and a blank home page is a poor way to judge a
 * layout — so when the catalogue is empty this falls back to the demo data,
 * sorted through the same engine the browse pages use. The page is told which
 * it received rather than passing sample numbers off as real ones.
 */
/**
 * Applies the administrator's chosen lineup.
 *
 * The saved order wins; anything featured but not explicitly placed follows,
 * so turning on `isFeatured` still has an effect without a visit to the home
 * page settings. Ids that no longer resolve are simply absent.
 */
function orderFeatured(
  chosen: ContentCardModel[],
  flagged: ContentCardModel[],
): ContentCardModel[] {
  if (chosen.length === 0) return flagged;

  const chosenIds = new Set(chosen.map((item) => item.id));
  return [...chosen, ...flagged.filter((item) => !chosenIds.has(item.id))];
}

function toCopy(settings: Record<string, unknown>): HomeCopy {
  const quickLinks = String(settings.quickLinks ?? HOME_DEFAULTS.quickLinks)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    heroTitle: String(settings.heroTitle ?? HOME_DEFAULTS.heroTitle),
    heroDescription: String(settings.heroDescription ?? HOME_DEFAULTS.heroDescription),
    quickLinks,
  };
}

/**
 * Everything the home page renders.
 *
 * Wrapped so that no single failure can blank the site's front door. The
 * individual queries already fall back through `safeQuery`, but the assembly
 * around them — settings parsing, ordering, mapping — can throw too, and the
 * home page is the one route where showing *something* always beats showing
 * an error card.
 */
export async function getHomeData(): Promise<HomeData> {
  try {
    return await loadHomeData();
  } catch (error) {
    console.error("[home] falling back to the demo catalogue:", error);
    return demoHomeData();
  }
}

/** The demo catalogue, used for a fresh install and as the last resort above. */
function demoHomeData(): HomeData {
  const latest = queryMockContent(demoFilters({ sort: "newest" })).items;
  return {
    copy: toCopy({}),
    ticker: toTicker(latest),
    featured: queryMockContent(demoFilters({ featuredOnly: true })).items,
    latest,
    popular: queryMockContent(demoFilters({ sort: "popular" })).items,
    categories: mockCategories,
    creators: queryMockCreators(1, 6).items,
    isDemo: true,
  };
}

/** Newest additions, shaped for the live strip under the hero. */
function toTicker(items: ContentCardModel[]): TickerEntry[] {
  return items.slice(0, 12).map((item) => ({
    id: item.id,
    title: item.title,
    slug: item.slug,
    creatorName: item.creator?.name ?? null,
    addedAt: (item.publishedAt ?? new Date()).toISOString(),
  }));
}

async function loadHomeData(): Promise<HomeData> {
  const [sections, categories, creators, settings] = await Promise.all([
    safeQuery(() => getHomeSections(), { featured: [], latest: [], popular: [] }),
    safeQuery(() => listCategories(), [] as CategorySummary[]),
    safeQuery(() => listCreators(1, 6), null),
    safeQuery(() => getSettings("home"), {} as Record<string, unknown>),
  ]);

  const copy = toCopy(settings);
  const featuredOrder = Array.isArray(settings.featuredOrder)
    ? (settings.featuredOrder as string[])
    : [];

  // Fetched by id rather than filtered out of the flagged pool: an
  // administrator can place any published recording, flagged or not.
  const chosenFeatured = await safeQuery(() => getContentByIds(featuredOrder), []);

  const hasContent = sections.latest.length > 0 || sections.popular.length > 0;

  if (!hasContent) return { ...demoHomeData(), copy };

  return {
    copy,
    ticker: toTicker(sections.latest),
    featured: orderFeatured(chosenFeatured, sections.featured),
    latest: sections.latest,
    popular: sections.popular,
    categories: categories.length > 0 ? categories : mockCategories,
    creators: creators?.items.length ? creators.items : queryMockCreators(1, 6).items,
    isDemo: false,
  };
}

/**
 * Contributors for the home rail.
 *
 * Two orderings of the same table. "Recently added" is derived from each
 * contributor's newest published recording rather than from a timestamp on the
 * contributor row: the question is what has arrived lately, and a contributor
 * added months ago who uploaded this morning belongs at the top.
 */
export async function getSidebarCreators(): Promise<{
  recent: SidebarCreator[];
  popular: SidebarCreator[];
}> {
  const [recentRows, popularRows] = await Promise.all([
    db.creator.findMany({
      where: { isActive: true, content: { some: publishedContentFilter } },
      orderBy: { content: { _count: "desc" } },
      take: 40,
      select: {
        id: true,
        slug: true,
        name: true,
        avatar: true,
        isVerified: true,
        contentCount: true,
        content: {
          where: publishedContentFilter,
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
    db.creator.findMany({
      where: { isActive: true, contentCount: { gt: 0 } },
      orderBy: [{ totalViews: "desc" }, { contentCount: "desc" }],
      take: 12,
      select: {
        id: true,
        slug: true,
        name: true,
        avatar: true,
        isVerified: true,
        contentCount: true,
      },
    }),
  ]);

  const recent = (
    await Promise.all(
      recentRows.map(async (row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        avatarUrl: await resolveAssetUrl(row.avatar),
        isVerified: row.isVerified,
        contentCount: row.contentCount,
        lastAddedAt: row.content[0]?.createdAt ?? null,
      })),
    )
  )
    // Sorted here rather than in SQL: ordering by a related row's column needs
    // a correlated subquery Prisma cannot express, and forty rows is nothing.
    .sort((a, b) => (b.lastAddedAt?.getTime() ?? 0) - (a.lastAddedAt?.getTime() ?? 0))
    .slice(0, 18);

  const popular = await Promise.all(
    popularRows.map(async (row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      avatarUrl: await resolveAssetUrl(row.avatar),
      isVerified: row.isVerified,
      contentCount: row.contentCount,
      lastAddedAt: null,
    })),
  );

  return { recent, popular };
}
