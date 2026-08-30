import Link from "next/link";
import { Container } from "@/components/layout/container";
import { AdminPageHeader, StatCard } from "@/components/admin/admin-shell";
import { AdminTable, type Column } from "@/components/admin/admin-table";
import { MediaDeleteButton } from "@/components/admin/media-delete-button";
import { EmptyState } from "@/components/ui/states";
import { requireAdmin } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { findOrphanedMedia, type OrphanReport } from "@/server/services/media-service";
import { formatDate } from "@/lib/utils/format";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };

const EMPTY: OrphanReport = { unreferencedRecords: [], missingObjects: [], scanned: 0 };

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
 * Orphan review.
 *
 * Report only — nothing is swept automatically. An asset can look orphaned
 * simply because a draft that references it has not been saved yet, so an
 * automatic cleanup would quietly destroy real work. A human decides.
 */
export default async function OrphanMediaPage() {
  await requireAdmin();
  const report = await safeQuery(() => findOrphanedMedia(200), EMPTY);

  type Row = OrphanReport["unreferencedRecords"][number];

  const columns: Array<Column<Row>> = [
    {
      key: "key",
      header: "Object",
      cell: (row) => (
        <span className="block truncate font-mono text-2xs text-ink">{row.objectKey ?? "—"}</span>
      ),
    },
    { key: "kind", header: "Type", cell: (row) => <span className="slate">{row.kind}</span> },
    {
      key: "size",
      header: "Size",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-muted">
          {formatBytes(row.sizeBytes)}
        </span>
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
      cell: (row) => <MediaDeleteButton assetId={row.id} label={row.objectKey ?? row.id} />,
    },
  ];

  return (
    <Container className="py-8">
      <AdminPageHeader
        title="Orphan review"
        breadcrumb={{ label: "Media", href: routes.admin.media }}
        description="Assets that no record points at, and records whose file is missing. Nothing here is deleted automatically."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Scanned" value={report.scanned} />
        <StatCard
          label="Unreferenced records"
          value={report.unreferencedRecords.length}
          tone={report.unreferencedRecords.length > 0 ? "accent" : "default"}
          hint="Safe to delete once reviewed"
        />
        <StatCard
          label="Missing files"
          value={report.missingObjects.length}
          tone={report.missingObjects.length > 0 ? "critical" : "default"}
          hint="Record exists, file does not"
        />
      </div>

      <section aria-labelledby="unreferenced" className="mb-8">
        <h2 id="unreferenced" className="slate mb-3">
          Unreferenced records
        </h2>
        <AdminTable
          caption="Unreferenced media"
          columns={columns}
          rows={report.unreferencedRecords}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              title="Nothing unreferenced"
              description="Every asset is in use by at least one record."
            />
          }
        />
      </section>

      {report.missingObjects.length > 0 ? (
        <section aria-labelledby="missing">
          <h2 id="missing" className="slate mb-3">
            Records whose file is missing
          </h2>
          <div className="rounded-card border border-critical/30 bg-critical/5 p-4">
            <p className="mb-3 text-meta text-ink-muted">
              These rows point at objects that are not in storage. Usually a failed upload or a file
              removed outside the application.
            </p>
            <ul className="space-y-1.5">
              {report.missingObjects.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-2xs text-ink-muted">
                    {entry.objectKey ?? entry.id}
                  </span>
                  <MediaDeleteButton assetId={entry.id} label={entry.objectKey ?? entry.id} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <p className="mt-8 text-meta text-ink-faint">
        Scans the {report.scanned} most recent assets. A full-bucket reconciliation against storage
        is a scheduled job, not a page request.{" "}
        <Link href={routes.admin.media} className="text-accent hover:underline">
          Back to media
        </Link>
      </p>
    </Container>
  );
}
