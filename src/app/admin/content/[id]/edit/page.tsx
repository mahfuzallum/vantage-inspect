import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { ContentForm } from "@/components/admin/content-form";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/auth/guards";
import { getAdminContent, getContentFormOptions } from "@/server/services/admin-service";
import { deleteContentAction } from "@/server/actions/admin-content";
import { routes } from "@/config/routes";
import { getContentStatistics } from "@/server/services/analytics-service";
import { FormSection } from "@/components/admin/admin-shell";
import { formatCount, formatDate } from "@/lib/utils/format";
import { safeQuery } from "@/lib/db";

export const metadata = { robots: { index: false, follow: false } };

export default async function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;

  const [content, options, statistics] = await Promise.all([
    getAdminContent(id),
    getContentFormOptions(),
    // Non-critical: a failed aggregate hides the panel rather than breaking
    // the editor, which must stay usable if analytics is unavailable.
    safeQuery(() => getContentStatistics(id, "30d"), null),
  ]);

  if (!content) notFound();

  return (
    <Container className="max-w-3xl py-8">
      <AdminPageHeader
        title={content.title}
        breadcrumb={{ label: "Content", href: routes.admin.content }}
        description={`/content/${content.slug}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={routes.content(content.slug)}>View public page</Link>
            </Button>
            {/* Deletion is ADMIN-only; moderators archive instead. */}
            {staff.role === "ADMIN" ? (
              <ConfirmDialog
                trigger={
                  <Button variant="danger" size="sm">
                    Delete
                  </Button>
                }
                title="Delete this recording?"
                description="This removes the record, its tag links, saves and history. It cannot be undone."
                confirmLabel="Delete permanently"
                requireTyped={content.title.slice(0, 24)}
                action={deleteContentAction.bind(null, content.id)}
              />
            ) : null}
          </>
        }
      />

      {statistics ? (
        <FormSection
          className="mb-6"
          title="Statistics"
          description="Read from the view log. Last 30 days unless stated."
        >
          <dl className="grid gap-x-6 gap-y-3 text-meta sm:grid-cols-4">
            <div>
              <dt className="text-ink-muted">Total views</dt>
              <dd className="font-mono text-lg tabular-nums text-ink">
                {formatCount(statistics.totalViews)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Views (30d)</dt>
              <dd className="font-mono text-lg tabular-nums text-ink">
                {formatCount(statistics.rangeViews)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Saves</dt>
              <dd className="font-mono text-lg tabular-nums text-ink">
                {formatCount(statistics.favorites)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Views per day</dt>
              <dd className="font-mono text-lg tabular-nums text-ink">
                {statistics.viewsPerDay ?? "—"}
              </dd>
            </div>
          </dl>
          {statistics.publishedAt ? (
            <p className="slate">Published {formatDate(statistics.publishedAt)}</p>
          ) : (
            <p className="slate">Not yet published — no publication statistics.</p>
          )}
        </FormSection>
      ) : null}

      <ContentForm
        options={options}
        values={{
          id: content.id,
          title: content.title,
          slug: content.slug,
          summary: content.summary ?? "",
          description: content.description ?? "",
          kind: content.kind,
          status: content.status,
          isFeatured: content.isFeatured,
          durationSeconds: content.durationSeconds,
          language: content.language ?? "",
          creatorId: content.creatorId ?? "",
          categoryId: content.categoryId ?? "",
          tagIds: content.tags.map((link: { tagId: string }) => link.tagId),
          thumbnailUrl: content.thumbnail?.url ?? "",
          externalUrl: content.externalUrl ?? "",
          seoTitle: content.seoTitle ?? "",
          seoDescription: content.seoDescription ?? "",
          ogImageUrl: content.ogImageUrl ?? "",
        }}
      />
    </Container>
  );
}
