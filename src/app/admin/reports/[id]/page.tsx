import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { AdminPageHeader, FormSection } from "@/components/admin/admin-shell";
import { ReportReviewForm } from "@/components/admin/report-form";
import { Badge } from "@/components/ui/badge";
import { requireStaff } from "@/lib/auth/guards";
import { getAdminReport } from "@/server/services/admin-service";
import { formatDate } from "@/lib/utils/format";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const found = await getAdminReport(id);
  if (!found) notFound();

  const { report, target } = found;

  return (
    <Container className="max-w-2xl space-y-6 py-8">
      <AdminPageHeader
        title="Review report"
        breadcrumb={{ label: "Reports", href: routes.admin.reports }}
        description={`Filed ${formatDate(report.createdAt)}`}
      />

      <FormSection title="Report">
        <dl className="grid gap-x-6 gap-y-3 text-meta sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-ink-muted">Reason</dt>
            <dd className="text-ink">{report.reason.replace(/_/g, " ").toLowerCase()}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-muted">Status</dt>
            <dd>
              <Badge tone={report.status === "RESOLVED" ? "positive" : "caution"}>
                {report.status}
              </Badge>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-muted">Reported by</dt>
            <dd className="text-ink">
              {report.author ? (
                <Link
                  href={routes.admin.userDetail(report.author.id)}
                  className="hover:text-accent"
                >
                  @{report.author.username}
                </Link>
              ) : (
                "Anonymous"
              )}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-muted">Handled by</dt>
            <dd className="text-ink">{report.handler?.displayName ?? "Unassigned"}</dd>
          </div>
        </dl>

        {report.message ? (
          <div className="rounded-control border border-line bg-raised px-3 py-2.5">
            <p className="slate mb-1">What the reader said</p>
            <p className="whitespace-pre-line text-meta text-ink">{report.message}</p>
          </div>
        ) : null}
      </FormSection>

      <FormSection title="Reported item">
        {target ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={routes.admin.contentEdit(target.id)}
                className="block truncate text-sm text-ink hover:text-accent"
              >
                {target.title}
              </Link>
              <span className="slate">/content/{target.slug}</span>
            </div>
            <div className="flex gap-2">
              <Badge tone={target.status === "PUBLISHED" ? "positive" : "neutral"}>
                {target.status}
              </Badge>
              <Link
                href={routes.content(target.slug)}
                className="text-meta text-ink-muted hover:text-accent"
              >
                View public page
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-meta text-ink-muted">
            The reported item no longer exists, or is not a content record.
          </p>
        )}
      </FormSection>

      <ReportReviewForm
        reportId={report.id}
        status={report.status}
        handlerNote={report.handlerNote ?? ""}
      />
    </Container>
  );
}
