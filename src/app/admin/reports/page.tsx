import Link from "next/link";
import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { AdminTable, type Column } from "@/components/admin/admin-table";
import { AdminFilter } from "@/components/admin/admin-search";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { requireStaff } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { listAdminReports } from "@/server/services/admin-service";
import { adminListParamsSchema } from "@/validation/admin";
import { formatRelativeTime } from "@/lib/utils/format";
import { buildUrl } from "@/lib/utils/url";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };
type Row = Awaited<ReturnType<typeof listAdminReports>>["items"][number];

const TONES: Record<string, BadgeTone> = {
  OPEN: "caution",
  IN_REVIEW: "accent",
  RESOLVED: "positive",
  DISMISSED: "neutral",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaff();
  const raw = await searchParams;
  const params = adminListParamsSchema.parse({ status: raw.status, page: raw.page });
  const result = await safeQuery(() => listAdminReports(params), {
    items: [] as Row[],
    page: 1,
    perPage: 50,
    total: 0,
    totalPages: 0,
  });

  const columns: Array<Column<Row>> = [
    {
      key: "id",
      header: "Report",
      width: "8rem",
      cell: (row) => (
        <Link
          href={routes.admin.reportDetail(row.id)}
          className="font-mono text-2xs text-ink hover:text-accent"
        >
          {row.id.slice(-8)}
        </Link>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      cell: (row) => (
        <div className="min-w-0">
          <span className="block text-sm text-ink">
            {row.reason.replace(/_/g, " ").toLowerCase()}
          </span>
          <span className="slate">{row.targetType}</span>
        </div>
      ),
    },
    {
      key: "reporter",
      header: "Reported by",
      secondary: true,
      cell: (row) => (
        <span className="text-meta text-ink-muted">
          {row.author ? `@${row.author.username}` : "Anonymous"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <Badge tone={TONES[row.status] ?? "neutral"}>{row.status}</Badge>,
    },
    {
      key: "created",
      header: "Filed",
      secondary: true,
      cell: (row) => (
        <span className="text-meta text-ink-muted">{formatRelativeTime(row.createdAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Link
          href={routes.admin.reportDetail(row.id)}
          className="text-meta text-ink-muted hover:text-accent"
        >
          Review
        </Link>
      ),
    },
  ];

  return (
    <Container className="py-8">
      <AdminPageHeader
        title="Reports"
        description={`${result.total.toLocaleString()} report${result.total === 1 ? "" : "s"}`}
      />
      <div className="mb-4">
        <AdminFilter
          name="status"
          label="Status"
          anyLabel="All reports"
          options={[
            { value: "OPEN", label: "Open" },
            { value: "IN_REVIEW", label: "In review" },
            { value: "RESOLVED", label: "Resolved" },
            { value: "DISMISSED", label: "Dismissed" },
          ]}
        />
      </div>
      <AdminTable
        caption="Reports"
        columns={columns}
        rows={result.items}
        rowKey={(row) => row.id}
        empty={
          <EmptyState
            title="Nothing to review"
            description="Reports filed by readers appear here."
          />
        }
      />
      <Pagination
        className="mt-8"
        page={result.page}
        totalPages={result.totalPages}
        buildHref={(page) =>
          buildUrl(routes.admin.reports, {
            status: params.status,
            page: page > 1 ? page : undefined,
          })
        }
      />
    </Container>
  );
}
