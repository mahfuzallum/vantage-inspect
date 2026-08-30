import Link from "next/link";
import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { AdminTable, type Column } from "@/components/admin/admin-table";
import { AdminSearch, AdminFilter } from "@/components/admin/admin-search";
import { ProcessingStatusBadge } from "@/components/admin/processing-status";
import { BulkContentActions } from "@/components/admin/bulk-actions";
import { ContentStatusToggle } from "@/components/admin/status-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { Thumbnail } from "@/components/ui/thumbnail";
import { requireStaff } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { listAdminContent } from "@/server/services/admin-service";
import { adminListParamsSchema } from "@/validation/admin";
import { formatCount, formatDate, formatDuration } from "@/lib/utils/format";
import { buildUrl } from "@/lib/utils/url";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };

type Row = Awaited<ReturnType<typeof listAdminContent>>["items"][number];

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaff();
  const raw = await searchParams;
  const params = adminListParamsSchema.parse({
    q: raw.q,
    status: raw.status,
    page: raw.page,
    sort: raw.sort,
  });

  const result = await safeQuery(() => listAdminContent(params), {
    items: [] as Row[],
    page: 1,
    perPage: 50,
    total: 0,
    totalPages: 0,
  });

  /** Clicking the active header returns to the default order. */
  const sortHref = (key: string) =>
    buildUrl(routes.admin.content, {
      q: params.q,
      status: params.status,
      sort: params.sort === key ? undefined : key,
    });

  const columns: Array<Column<Row>> = [
    {
      key: "thumbnail",
      header: "",
      width: "5rem",
      cell: (row) => (
        <div className="relative aspect-video w-16 overflow-hidden rounded border border-line bg-sunken">
          <Thumbnail src={row.thumbnail?.url ?? null} alt="" seed={row.slug} sizes="4rem" />
        </div>
      ),
    },
    {
      key: "title",
      header: "Title",
      sortKey: "title",
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={routes.admin.contentEdit(row.id)}
            className="block truncate font-medium text-ink hover:text-accent"
          >
            {row.title}
          </Link>
          <span className="slate">
            {row.creator?.name ?? "Unattributed"}
            {row.category ? ` · ${row.category.name}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <Badge
            tone={
              row.status === "PUBLISHED"
                ? "positive"
                : row.status === "ARCHIVED"
                  ? "caution"
                  : "neutral"
            }
          >
            {row.status}
          </Badge>
          {row.isFeatured ? <Badge tone="accent">Featured</Badge> : null}
          <ContentStatusToggle contentId={row.id} status={row.status} />
        </div>
      ),
    },
    {
      key: "processing",
      header: "Processing",
      secondary: true,
      cell: (row) => <ProcessingStatusBadge status={row.processingStatus} />,
    },
    {
      key: "views",
      header: "Views",
      sortKey: "views",
      align: "right",
      secondary: true,
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-muted">
          {formatCount(row.viewCount)}
        </span>
      ),
    },
    {
      key: "duration",
      header: "Length",
      align: "right",
      secondary: true,
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-muted">
          {row.durationSeconds ? formatDuration(row.durationSeconds) : "—"}
        </span>
      ),
    },
    {
      key: "updated",
      header: "Updated",
      sortKey: "updated",
      secondary: true,
      cell: (row) => <span className="text-meta text-ink-muted">{formatDate(row.updatedAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-3">
          {/* Draft and scheduled records are only reachable through preview. */}
          <Link
            href={`${routes.content(row.slug)}${row.status === "PUBLISHED" ? "" : "?preview=1"}`}
            target="_blank"
            rel="noopener"
            className="text-meta text-ink-muted hover:text-accent"
          >
            Preview
          </Link>
          <Link
            href={routes.admin.contentEdit(row.id)}
            className="text-meta text-ink-muted hover:text-accent"
          >
            Edit
          </Link>
        </div>
      ),
    },
  ];

  return (
    <Container className="py-8">
      <AdminPageHeader
        title="Content"
        description={`${result.total.toLocaleString()} record${result.total === 1 ? "" : "s"}`}
        actions={
          <Button asChild size="sm">
            <Link href={routes.admin.contentNew}>New content</Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AdminSearch placeholder="Search titles and slugs…" className="min-w-56 flex-1" />
        <AdminFilter
          name="status"
          label="Status"
          anyLabel="All statuses"
          options={[
            { value: "DRAFT", label: "Draft" },
            { value: "SCHEDULED", label: "Scheduled" },
            { value: "PUBLISHED", label: "Published" },
            { value: "ARCHIVED", label: "Archived" },
          ]}
        />
        <AdminFilter
          name="sort"
          label="Sort"
          anyLabel="Newest"
          options={[
            { value: "oldest", label: "Oldest" },
            { value: "title", label: "Title" },
            { value: "views", label: "Views" },
            { value: "updated", label: "Recently updated" },
          ]}
        />
      </div>

      {/* Selection and bulk actions share one form, so ids never leave the DOM. */}
      <BulkContentActions>
        <AdminTable
          caption="Content records"
          columns={columns}
          rows={result.items}
          rowKey={(row) => row.id}
          selectable
          activeSort={params.sort}
          sortHref={sortHref}
          descendingSorts={["views", "updated", "newest"]}
          empty={
            <EmptyState
              title="No records match"
              description="Try a different search, or create the first record."
            />
          }
        />
      </BulkContentActions>

      <Pagination
        className="mt-8"
        page={result.page}
        totalPages={result.totalPages}
        buildHref={(page) =>
          buildUrl(routes.admin.content, {
            q: params.q,
            status: params.status,
            sort: params.sort,
            page: page > 1 ? page : undefined,
          })
        }
      />
    </Container>
  );
}
