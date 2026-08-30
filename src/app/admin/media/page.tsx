import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { AdminTable, type Column } from "@/components/admin/admin-table";
import { AdminSearch, AdminFilter } from "@/components/admin/admin-search";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { Thumbnail } from "@/components/ui/thumbnail";
import { MediaDeleteButton } from "@/components/admin/media-delete-button";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { listAdminMedia } from "@/server/services/admin-service";
import { adminListParamsSchema } from "@/validation/admin";
import { formatDate, formatDuration } from "@/lib/utils/format";
import { buildUrl } from "@/lib/utils/url";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };
type Row = Awaited<ReturnType<typeof listAdminMedia>>["items"][number];

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const units = ["B", "kB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Media inventory.
 *
 * Shows where each asset lives and what references it. Provider names are
 * shown; endpoints, buckets and keys to credentials never are.
 */
export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaff();
  const raw = await searchParams;
  const params = adminListParamsSchema.parse({ q: raw.q, status: raw.status, page: raw.page });
  const result = await safeQuery(() => listAdminMedia(params), {
    items: [] as Row[],
    page: 1,
    perPage: 50,
    total: 0,
    totalPages: 0,
  });

  const columns: Array<Column<Row>> = [
    {
      key: "preview",
      header: "",
      width: "5rem",
      cell: (row) =>
        row.kind === "IMAGE" ? (
          <div className="relative aspect-video w-16 overflow-hidden rounded border border-line bg-sunken">
            <Thumbnail src={row.url} alt="" seed={row.id} sizes="4rem" />
          </div>
        ) : (
          <span className="slate">{row.kind}</span>
        ),
    },
    {
      key: "key",
      header: "Object",
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate font-mono text-2xs text-ink">
            {row.objectKey ?? row.url ?? "—"}
          </span>
          <span className="slate">{row.mimeType ?? "unknown type"}</span>
        </div>
      ),
    },
    {
      key: "provider",
      header: "Storage",
      cell: (row) => (
        <Badge tone={row.provider === "EXTERNAL" ? "neutral" : "accent"}>{row.provider}</Badge>
      ),
    },
    {
      key: "size",
      header: "Size",
      align: "right",
      secondary: true,
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-muted">
          {formatBytes(row.sizeBytes)}
        </span>
      ),
    },
    {
      key: "dimensions",
      header: "Dimensions",
      align: "right",
      secondary: true,
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-muted">
          {row.width && row.height
            ? `${row.width}×${row.height}`
            : row.durationSeconds
              ? formatDuration(row.durationSeconds)
              : "—"}
        </span>
      ),
    },
    {
      key: "refs",
      header: "Used by",
      align: "right",
      cell: (row) => {
        const total = row._count.thumbnailFor + row._count.sourceFor + row._count.creatorAvatars;
        return (
          <span
            className={
              total === 0 ? "slate text-caution" : "font-mono text-2xs tabular-nums text-ink-muted"
            }
          >
            {total === 0 ? "unreferenced" : total}
          </span>
        );
      },
    },
    {
      key: "created",
      header: "Added",
      secondary: true,
      cell: (row) => <span className="text-meta text-ink-muted">{formatDate(row.createdAt)}</span>,
    },
    {
      // Offered only where nothing references the asset. The server enforces
      // the same rule, so hiding the control is convenience, not the guard.
      key: "actions",
      header: "",
      align: "right",
      cell: (row) =>
        row._count.thumbnailFor + row._count.sourceFor + row._count.creatorAvatars === 0 ? (
          <MediaDeleteButton assetId={row.id} label={row.objectKey ?? row.url ?? row.id} />
        ) : (
          <span className="slate">in use</span>
        ),
    },
  ];

  return (
    <Container className="py-8">
      <AdminPageHeader
        title="Media"
        description={`${result.total.toLocaleString()} asset${result.total === 1 ? "" : "s"}. Assets marked unreferenced are candidates for review.`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={routes.admin.mediaOrphans}>Orphan review</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={routes.admin.mediaUpload}>Upload video</Link>
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AdminSearch placeholder="Search object keys…" className="min-w-56 flex-1" />
        <AdminFilter
          name="status"
          label="Type"
          anyLabel="All types"
          options={[
            { value: "IMAGE", label: "Images" },
            { value: "VIDEO", label: "Video" },
            { value: "AUDIO", label: "Audio" },
            { value: "DOCUMENT", label: "Documents" },
          ]}
        />
      </div>
      <AdminTable
        caption="Media assets"
        columns={columns}
        rows={result.items}
        rowKey={(row) => row.id}
        empty={
          <EmptyState
            title="No media yet"
            description="Assets appear here as content and avatars are added."
          />
        }
      />
      <Pagination
        className="mt-8"
        page={result.page}
        totalPages={result.totalPages}
        buildHref={(page) =>
          buildUrl(routes.admin.media, {
            q: params.q,
            status: params.status,
            page: page > 1 ? page : undefined,
          })
        }
      />
    </Container>
  );
}
