import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { ContentForm } from "@/components/admin/content-form";
import { requireStaff } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { getContentFormOptions } from "@/server/services/admin-service";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };

export default async function NewContentPage() {
  await requireStaff();
  const options = await safeQuery(() => getContentFormOptions(), {
    creators: [],
    categories: [],
    tags: [],
  });

  return (
    <Container className="max-w-3xl py-8">
      <AdminPageHeader
        title="New content"
        breadcrumb={{ label: "Content", href: routes.admin.content }}
        description="Created as a draft unless you set the status to published."
      />
      <ContentForm
        options={options}
        values={{
          title: "",
          slug: "",
          summary: "",
          description: "",
          kind: "VIDEO",
          status: "DRAFT",
          isFeatured: false,
          durationSeconds: null,
          language: "",
          creatorId: "",
          categoryId: "",
          tagIds: [],
          thumbnailUrl: "",
          externalUrl: "",
          seoTitle: "",
          seoDescription: "",
          ogImageUrl: "",
        }}
      />
    </Container>
  );
}
