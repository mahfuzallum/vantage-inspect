import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { HomeSettingsForm, type FeaturedItem } from "@/components/admin/home-settings-form";
import { requireAdmin } from "@/lib/auth/guards";
import { db, safeQuery } from "@/lib/db";
import { getSettings, HOME_DEFAULTS } from "@/server/services/settings-service";
import { resolveAssetUrl } from "@/lib/media";

export const metadata = { robots: { index: false, follow: false } };

/**
 * Reads the saved lineup back in its stored order.
 *
 * A database `IN` returns rows in whatever order it likes, so the ids are
 * re-sorted here. Ids that no longer resolve — a deleted or unpublished
 * recording — are dropped rather than rendered as a gap.
 */
async function loadFeatured(ids: string[]): Promise<FeaturedItem[]> {
  if (ids.length === 0) return [];

  const rows = await db.content.findMany({
    where: { id: { in: ids }, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      slug: true,
      thumbnail: true,
      creator: { select: { name: true } },
    },
  });

  const byId = new Map(rows.map((row) => [row.id, row]));

  const ordered: FeaturedItem[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    ordered.push({
      id: row.id,
      title: row.title,
      slug: row.slug,
      creatorName: row.creator?.name ?? null,
      thumbnailUrl: await resolveAssetUrl(row.thumbnail),
    });
  }
  return ordered;
}

export default async function AdminHomePage() {
  await requireAdmin();

  const settings = await safeQuery(
    () => getSettings("home"),
    HOME_DEFAULTS as unknown as Record<string, unknown>,
  );

  const ids = Array.isArray(settings.featuredOrder) ? (settings.featuredOrder as string[]) : [];
  const featured = await safeQuery(() => loadFeatured(ids), []);

  return (
    <Container className="max-w-2xl py-8">
      <AdminPageHeader
        title="Home page"
        description="The headline, the shortcuts and which recordings take the featured slots."
      />
      <HomeSettingsForm
        values={{
          heroTitle: String(settings.heroTitle ?? HOME_DEFAULTS.heroTitle),
          heroDescription: String(settings.heroDescription ?? HOME_DEFAULTS.heroDescription),
          quickLinks: String(settings.quickLinks ?? HOME_DEFAULTS.quickLinks),
          featured,
        }}
      />
    </Container>
  );
}
