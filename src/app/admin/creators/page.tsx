import Link from "next/link";
import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { AdminTable, type Column } from "@/components/admin/admin-table";
import { AdminSearch } from "@/components/admin/admin-search";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { requireStaff } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { listAdminCreators } from "@/server/services/admin-service";
import { adminListParamsSchema } from "@/validation/admin";
import { formatCount, formatDate } from "@/lib/utils/format";
import { buildUrl } from "@/lib/utils/url";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };
type Row = Awaited<ReturnType<typeof listAdminCreators>>["items"][number];

export default async function AdminCreatorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaff();
  const raw = await searchParams;
  const params = adminListParamsSchema.parse({ q: raw.q, page: raw.page, sort: raw.sort });
  const result = await safeQuery(() => listAdminCreators(params), {
    items: [] as Row[],
    page: 1,
    perPage: 50,
    total: 0,
    totalPages: 0,
  });

  const columns: Array<Column<Row>> = [
    {
      key: "name",
      header: "Contributor",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.name} src={row.avatar?.url ?? null} size="sm" />
          <div className="min-w-0">
            <Link
              href={routes.admin.creatorEdit(row.id)}
              className="block truncate font-medium text-ink hover:text-accent"
            >
              {row.name}
            </Link>
            <span className="slate">/{row.slug}</span>
          </div>
        </div>
      ),
    },
    {
      key: "content",
      header: "Recordings",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-muted">{row.contentCount}</span>
      ),
    },
    {
      key: "views",
      header: "Views",
      align: "right",
      secondary: true,
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-muted">
          {formatCount(row.totalViews)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={row.isActive ? "positive" : "neutral"}>
            {row.isActive ? "Active" : "Hidden"}
          </Badge>
          {row.isVerified ? <Badge tone="accent">Verified</Badge> : null}
        </div>
      ),
    },
    {
      key: "created",
      header: "Added",
      secondary: true,
      cell: (row) => <span className="text-meta text-ink-muted">{formatDate(row.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Link
          href={routes.admin.creatorEdit(row.id)}
          className="text-meta text-ink-muted hover:text-accent"
        >
          Edit
        </Link>
      ),
    },
  ];

  return (
    <Container className="py-8">
      <AdminPageHeader
        title="Contributors"
        description={`${result.total.toLocaleString()} record${result.total === 1 ? "" : "s"}`}
        actions={
          <Button asChild size="sm">
            <Link href={routes.admin.creatorNew}>New contributor</Link>
          </Button>
        }
      />
      <div className="mb-4">
        <AdminSearch placeholder="Search contributors…" className="max-w-md" />
      </div>
      <AdminTable
        caption="Contributors"
        columns={columns}
        rows={result.items}
        rowKey={(row) => row.id}
        empty={
          <EmptyState
            title="No contributors match"
            description="Try a different search, or add the first one."
          />
        }
      />
      <Pagination
        className="mt-8"
        page={result.page}
        totalPages={result.totalPages}
        buildHref={(page) =>
          buildUrl(routes.admin.creators, { q: params.q, page: page > 1 ? page : undefined })
        }
      />
    </Container>
  );
}
