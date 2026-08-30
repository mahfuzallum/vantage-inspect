import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { TagForm } from "@/components/admin/entity-forms";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { MergeTagControl } from "@/components/admin/merge-tag-control";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/admin/admin-shell";
import { requireStaff } from "@/lib/auth/guards";
import { getAdminTag, listAdminTags } from "@/server/services/admin-service";
import { deleteTagAction } from "@/server/actions/admin-taxonomy";
import { adminListParamsSchema } from "@/validation/admin";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };

export default async function EditTagPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const tag = await getAdminTag(id);
  if (!tag) notFound();

  const others = await listAdminTags(adminListParamsSchema.parse({ page: 1, sort: "title" }));

  return (
    <Container className="max-w-2xl space-y-6 py-8">
      <AdminPageHeader
        title={tag.name}
        breadcrumb={{ label: "Topics", href: routes.admin.tags }}
        description={`Used by ${tag.contentCount} recording${tag.contentCount === 1 ? "" : "s"}`}
        actions={
          staff.role === "ADMIN" ? (
            <ConfirmDialog
              trigger={
                <Button variant="danger" size="sm">
                  Delete
                </Button>
              }
              title={`Delete “${tag.name}”?`}
              description={`This removes the topic and its ${tag.contentCount} link(s). The recordings themselves are untouched.`}
              confirmLabel="Delete topic"
              action={deleteTagAction.bind(null, tag.id)}
            />
          ) : null
        }
      />

      <TagForm
        values={{ id: tag.id, name: tag.name, slug: tag.slug, description: tag.description ?? "" }}
      />

      {staff.role === "ADMIN" ? (
        <FormSection
          title="Merge"
          description="Move every link from this topic onto another, then remove this one."
        >
          <MergeTagControl
            sourceId={tag.id}
            sourceName={tag.name}
            targets={others.items
              .filter((t) => t.id !== tag.id)
              .map((t) => ({ id: t.id, name: t.name }))}
          />
        </FormSection>
      ) : null}
    </Container>
  );
}
