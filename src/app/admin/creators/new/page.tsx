import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { CreatorForm } from "@/components/admin/entity-forms";
import { requireStaff } from "@/lib/auth/guards";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };

export default async function NewCreatorPage() {
  await requireStaff();
  return (
    <Container className="max-w-2xl py-8">
      <AdminPageHeader
        title="New contributor"
        breadcrumb={{ label: "Contributors", href: routes.admin.creators }}
      />
      <CreatorForm
        values={{
          name: "",
          slug: "",
          bio: "",
          about: "",
          socialLinks: {},
          startedAt: "",
          websiteUrl: "",
          avatarUrl: "",
          isVerified: false,
          isActive: true,
          seoTitle: "",
          seoDescription: "",
        }}
      />
    </Container>
  );
}
