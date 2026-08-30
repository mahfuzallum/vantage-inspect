import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { CreatorForm } from "@/components/admin/entity-forms";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/auth/guards";
import { getAdminCreator } from "@/server/services/admin-service";
import { deleteCreatorAction } from "@/server/actions/admin-taxonomy";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };

export default async function EditCreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const creator = await getAdminCreator(id);
  if (!creator) notFound();

  return (
    <Container className="max-w-2xl py-8">
      <AdminPageHeader
        title={creator.name}
        breadcrumb={{ label: "Contributors", href: routes.admin.creators }}
        description={`${creator.contentCount} recording${creator.contentCount === 1 ? "" : "s"} attributed`}
        actions={
          staff.role === "ADMIN" ? (
            <ConfirmDialog
              trigger={
                <Button variant="danger" size="sm">
                  Delete
                </Button>
              }
              title="Delete this contributor?"
              description={`Their ${creator.contentCount} recording(s) are kept but become unattributed. This cannot be undone.`}
              confirmLabel="Delete contributor"
              requireTyped={creator.name.slice(0, 24)}
              action={deleteCreatorAction.bind(null, creator.id)}
            />
          ) : null
        }
      />
      <CreatorForm
        values={{
          id: creator.id,
          name: creator.name,
          slug: creator.slug,
          bio: creator.bio ?? "",
          about: creator.about ?? "",
          socialLinks: (creator.socialLinks ?? {}) as Record<string, string>,
          startedAt: creator.startedAt ? creator.startedAt.toISOString().slice(0, 10) : "",
          websiteUrl: creator.websiteUrl ?? "",
          avatarUrl: creator.avatar?.url ?? "",
          isVerified: creator.isVerified,
          isActive: creator.isActive,
          seoTitle: creator.seoTitle ?? "",
          seoDescription: creator.seoDescription ?? "",
        }}
      />
    </Container>
  );
}
