import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { CategoryForm } from "@/components/admin/entity-forms";
import { requireStaff } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { listAdminCategories } from "@/server/services/admin-service";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };

export default async function NewCategoryPage() {
  await requireStaff();
  const categories = await safeQuery(() => listAdminCategories(), []);
  return (
    <Container className="max-w-2xl py-8">
      <AdminPageHeader
        title="New subject"
        breadcrumb={{ label: "Subjects", href: routes.admin.categories }}
      />
      <CategoryForm
        parents={categories.map((c) => ({ id: c.id, name: c.name }))}
        values={{
          name: "",
          slug: "",
          description: "",
          parentId: "",
          position: 0,
          isActive: true,
          seoTitle: "",
          seoDescription: "",
        }}
      />
    </Container>
  );
}
