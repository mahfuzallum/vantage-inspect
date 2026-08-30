import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { SeoSettingsForm } from "@/components/admin/settings-forms";
import { requireAdmin } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { getSettings } from "@/server/services/settings-service";
import { siteConfig } from "@/config/site";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminSeoPage() {
  await requireAdmin();
  const settings = await safeQuery(() => getSettings("seo"), {} as Record<string, unknown>);

  return (
    <Container className="max-w-2xl py-8">
      <AdminPageHeader
        title="SEO defaults"
        description="Used wherever a page has no metadata of its own. Content and contributor pages still override these."
      />
      <SeoSettingsForm
        values={{
          defaultTitle: String(settings.defaultTitle ?? siteConfig.name),
          defaultDescription: String(settings.defaultDescription ?? siteConfig.description),
          defaultOgImage: String(settings.defaultOgImage ?? ""),
          twitterHandle: String(settings.twitterHandle ?? siteConfig.twitterHandle),
          robotsAllowIndexing: Boolean(settings.robotsAllowIndexing ?? true),
        }}
      />
    </Container>
  );
}
