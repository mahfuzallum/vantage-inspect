import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { TagForm } from "@/components/admin/entity-forms";
import { requireStaff } from "@/lib/auth/guards";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };

export default async function NewTagPage() {
  await requireStaff();
  return (
    <Container className="max-w-2xl py-8">
      <AdminPageHeader
        title="New topic"
        breadcrumb={{ label: "Topics", href: routes.admin.tags }}
      />
      <TagForm values={{ name: "", slug: "", description: "" }} />
    </Container>
  );
}
