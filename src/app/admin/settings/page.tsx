import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { SiteSettingsForm, UnlockCodeForm } from "@/components/admin/settings-forms";
import { MonetizationSettingsForm } from "@/components/admin/monetization-settings-form";
import { requireAdmin } from "@/lib/auth/guards";
import { db, safeQuery } from "@/lib/db";
import { getSettings } from "@/server/services/settings-service";
import { siteConfig } from "@/config/site";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminSettingsPage() {
  // Configuration is ADMIN-only — moderators cannot reach this page at all.
  await requireAdmin();
  const [settings, monetization] = await Promise.all([
    safeQuery(() => getSettings("general"), {} as Record<string, unknown>),
    safeQuery(() => getSettings("monetization"), {} as Record<string, unknown>),
  ]);

  // Only whether a code exists — the hash itself never leaves the server.
  const unlockConfigured = await safeQuery(
    async () =>
      Boolean(
        await db.siteSetting.findUnique({
          where: { key: "adminUnlockCode" },
          select: { key: true },
        }),
      ),
    false,
  );

  return (
    <Container className="max-w-2xl py-8">
      <AdminPageHeader
        title="Site settings"
        description="Stored in the database and read at request time — nothing here is hardcoded."
      />
      <SiteSettingsForm
        values={{
          siteName: String(settings.siteName ?? siteConfig.name),
          tagline: String(settings.tagline ?? siteConfig.tagline),
          contactEmail: String(settings.contactEmail ?? siteConfig.contactEmail),
          paginationSize: Number(settings.paginationSize ?? 24),
          maintenanceMode: Boolean(settings.maintenanceMode ?? false),
          maintenanceMessage: String(settings.maintenanceMessage ?? ""),
        }}
      />

      <MonetizationSettingsForm values={monetization} />

      <div className="mt-12 border-t border-line pt-10">
        <UnlockCodeForm isConfigured={unlockConfigured} />
      </div>
    </Container>
  );
}
