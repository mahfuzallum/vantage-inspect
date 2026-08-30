import Link from "next/link";
import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { AdminTable, type Column } from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { requireStaff } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { listAdminCategories } from "@/server/services/admin-service";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };
type Row = Awaited<ReturnType<typeof listAdminCategories>>[number];

export default async function AdminCategoriesPage() {
  await requireStaff();
  const rows = await safeQuery(() => listAdminCategories(), [] as Row[]);

  const columns: Array<Column<Row>> = [
    {
      key: "name",
      header: "Subject",
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={routes.admin.categoryEdit(row.id)}
            className="block truncate font-medium text-ink hover:text-accent"
          >
            {row.name}
          </Link>
          <span className="slate">
            /{row.slug}
            {row.parent ? ` · under ${row.parent.name}` : ""}
          </span>
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
      header: "Recordings",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-muted">{row.contentCount}</span>
      ),
    },
    {
      key: "position",
      header: "Order",
      align: "right",
      secondary: true,
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-faint">{row.position}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <Badge tone={row.isActive ? "positive" : "neutral"}>
          {row.isActive ? "Active" : "Hidden"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Link
          href={routes.admin.categoryEdit(row.id)}
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
        title="Subjects"
        description="Ordered by position, then name."
        actions={
          <Button asChild size="sm">
            <Link href={routes.admin.categoryNew}>New subject</Link>
          </Button>
        }
      />
      <AdminTable
        caption="Subjects"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={
          <EmptyState
            title="No subjects yet"
            description="Create the first subject to start cataloguing."
          />
        }
      />
    </Container>
  );
}
