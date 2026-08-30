import Link from "next/link";
import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { AdminTable, type Column } from "@/components/admin/admin-table";
import { AdminSearch } from "@/components/admin/admin-search";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { requireStaff } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { listAdminTags } from "@/server/services/admin-service";
import { adminListParamsSchema } from "@/validation/admin";
import { formatDate } from "@/lib/utils/format";
import { buildUrl } from "@/lib/utils/url";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };
type Row = Awaited<ReturnType<typeof listAdminTags>>["items"][number];

export default async function AdminTagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaff();
  const raw = await searchParams;
  const params = adminListParamsSchema.parse({ q: raw.q, page: raw.page, sort: raw.sort });
  const result = await safeQuery(() => listAdminTags(params), {
    items: [] as Row[],
    page: 1,
    perPage: 50,
    total: 0,
    totalPages: 0,
  });

  const columns: Array<Column<Row>> = [
    {
      key: "name",
      header: "Topic",
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={routes.admin.tagEdit(row.id)}
            className="block truncate font-medium text-ink hover:text-accent"
          >
            {row.name}
          </Link>
          <span className="slate">/{row.slug}</span>
        </div>
      ),
    },
    {
      key: "description",
      header: "Description",
      secondary: true,
      cell: (row) => (
        <span className="line-clamp-1 text-meta text-ink-muted">{row.description ?? "—"}</span>
      ),
    },
    {
      key: "count",
      header: "Used by",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-muted">{row.contentCount}</span>
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
          href={routes.admin.tagEdit(row.id)}
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
        title="Topics"
        description={`${result.total.toLocaleString()} topic${result.total === 1 ? "" : "s"}`}
        actions={
          <Button asChild size="sm">
            <Link href={routes.admin.tagNew}>New topic</Link>
          </Button>
        }
      />
      <div className="mb-4">
        <AdminSearch placeholder="Search topics…" className="max-w-md" />
      </div>
      <AdminTable
        caption="Topics"
        columns={columns}
        rows={result.items}
        rowKey={(row) => row.id}
        empty={
          <EmptyState
            title="No topics match"
            description="Try a different search, or create one."
          />
        }
      />
      <Pagination
        className="mt-8"
        page={result.page}
        totalPages={result.totalPages}
        buildHref={(page) =>
          buildUrl(routes.admin.tags, { q: params.q, page: page > 1 ? page : undefined })
        }
      />
    </Container>
  );
}
