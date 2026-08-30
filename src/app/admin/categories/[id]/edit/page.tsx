import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { CategoryForm } from "@/components/admin/entity-forms";
import { DeleteCategoryDialog } from "@/components/admin/delete-category-dialog";
import { requireStaff } from "@/lib/auth/guards";
import { getAdminCategory, listAdminCategories } from "@/server/services/admin-service";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const [category, all] = await Promise.all([getAdminCategory(id), listAdminCategories()]);
  if (!category) notFound();

  return (
    <Container className="max-w-2xl py-8">
      <AdminPageHeader
        title={category.name}
        breadcrumb={{ label: "Subjects", href: routes.admin.categories }}
        description={`${category.contentCount} recording${category.contentCount === 1 ? "" : "s"} filed here`}
        actions={
          staff.role === "ADMIN" ? (
            <DeleteCategoryDialog
              categoryId={category.id}
              categoryName={category.name}
              contentCount={category.contentCount}
              alternatives={all
                .filter((c) => c.id !== category.id)
                .map((c) => ({ id: c.id, name: c.name }))}
            />
          ) : null
        }
      />
      <CategoryForm
        parents={all.map((c) => ({ id: c.id, name: c.name }))}
        values={{
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description ?? "",
          parentId: category.parentId ?? "",
          position: category.position,
          isActive: category.isActive,
          seoTitle: category.seoTitle ?? "",
          seoDescription: category.seoDescription ?? "",
        }}
      />
    </Container>
  );
}
