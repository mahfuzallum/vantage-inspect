import Link from "next/link";
import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { AdminTable, type Column } from "@/components/admin/admin-table";
import { AdminSearch, AdminFilter } from "@/components/admin/admin-search";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { requireStaff } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { listAdminUsers } from "@/server/services/admin-service";
import { adminListParamsSchema } from "@/validation/admin";
import { formatDate } from "@/lib/utils/format";
import { buildUrl } from "@/lib/utils/url";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };
type Row = Awaited<ReturnType<typeof listAdminUsers>>["items"][number];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaff();
  const raw = await searchParams;
  const params = adminListParamsSchema.parse({ q: raw.q, status: raw.status, page: raw.page });
  const result = await safeQuery(() => listAdminUsers(params), {
    items: [] as Row[],
    page: 1,
    perPage: 50,
    total: 0,
    totalPages: 0,
  });

  const columns: Array<Column<Row>> = [
    {
      key: "user",
      header: "Account",
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={routes.admin.userDetail(row.id)}
            className="block truncate font-medium text-ink hover:text-accent"
          >
            {row.displayName}
          </Link>
          <span className="slate">
            @{row.username} · {row.email}
          </span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (row) => (
        <Badge
          tone={row.role === "ADMIN" ? "accent" : row.role === "MODERATOR" ? "caution" : "neutral"}
        >
          {row.role}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <Badge tone={row.isActive ? "positive" : "critical"}>
          {row.isActive ? "Active" : "Suspended"}
        </Badge>
      ),
    },
    {
      key: "saved",
      header: "Saved",
      align: "right",
      secondary: true,
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-muted">
          {row._count.favorites}
        </span>
      ),
    },
    {
      key: "history",
      header: "History",
      align: "right",
      secondary: true,
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-muted">{row._count.history}</span>
      ),
    },
    {
      key: "joined",
      header: "Registered",
      secondary: true,
      cell: (row) => <span className="text-meta text-ink-muted">{formatDate(row.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Link
          href={routes.admin.userDetail(row.id)}
          className="text-meta text-ink-muted hover:text-accent"
        >
          View
        </Link>
      ),
    },
  ];

  return (
    <Container className="py-8">
      <AdminPageHeader
        title="Users"
        description={`${result.total.toLocaleString()} account${result.total === 1 ? "" : "s"}`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AdminSearch placeholder="Search name, username or email…" className="min-w-56 flex-1" />
        <AdminFilter
          name="status"
          label="Filter"
          anyLabel="All accounts"
          options={[
            { value: "active", label: "Active" },
            { value: "suspended", label: "Suspended" },
            { value: "ADMIN", label: "Administrators" },
            { value: "MODERATOR", label: "Moderators" },
          ]}
        />
      </div>
      <AdminTable
        caption="User accounts"
        columns={columns}
        rows={result.items}
        rowKey={(row) => row.id}
        empty={
          <EmptyState title="No accounts match" description="Try a different search or filter." />
        }
      />
      <Pagination
        className="mt-8"
        page={result.page}
        totalPages={result.totalPages}
        buildHref={(page) =>
          buildUrl(routes.admin.users, {
            q: params.q,
            status: params.status,
            page: page > 1 ? page : undefined,
          })
        }
      />
    </Container>
  );
}
