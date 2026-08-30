import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type Column<T> = {
  key: string;
  header: string;
  /** Cell renderer. Kept generic so no module reimplements table markup. */
  cell: (row: T) => ReactNode;
  /** Hidden below `lg` — used for secondary columns on narrow screens. */
  secondary?: boolean;
  align?: "left" | "right";
  width?: string;
  /**
   * Sort key this column maps to. Present means the header becomes a link that
   * re-sorts the list server-side — no client state, and the sorted view stays
   * shareable as a URL.
   */
  sortKey?: string;
};

export type AdminTableProps<T> = {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  /** Rendered instead of the table when there is nothing to show. */
  empty?: ReactNode;
  /** Leading checkbox column for bulk actions. */
  selectable?: boolean;
  caption?: string;
  /** Sort key currently applied, so the active header can show its direction. */
  activeSort?: string;
  /** Builds the href for a sortable header. Required for `sortKey` to render. */
  sortHref?: (sortKey: string) => string;
  /** Sort keys that read as descending, for the correct arrow direction. */
  descendingSorts?: readonly string[];
};

/**
 * One table implementation for every admin module.
 *
 * Scrolls horizontally inside its own container rather than pushing the page
 * wide, and secondary columns drop out below `lg` — an admin table with ten
 * columns is unusable on a phone otherwise.
 */
export function AdminTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  selectable = false,
  caption,
  activeSort,
  sortHref,
  descendingSorts = [],
}: AdminTableProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="overflow-x-auto rounded-card border border-line">
      <table className="w-full min-w-[44rem] text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}

        <thead className="border-b border-line bg-surface">
          <tr>
            {selectable ? (
              <th scope="col" className="w-10 px-3 py-3">
                <span className="sr-only">Select</span>
              </th>
            ) : null}

            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                aria-sort={
                  column.sortKey && activeSort === column.sortKey
                    ? descendingSorts.includes(column.sortKey)
                      ? "descending"
                      : "ascending"
                    : undefined
                }
                className={cn(
                  "slate px-4 py-3 font-normal",
                  column.align === "right" && "text-right",
                  column.secondary && "hidden lg:table-cell",
                )}
              >
                {column.sortKey && sortHref ? (
                  <SortableHeader
                    label={column.header}
                    sortKey={column.sortKey}
                    href={sortHref(column.sortKey)}
                    active={activeSort === column.sortKey}
                    descending={descendingSorts.includes(column.sortKey)}
                    align={column.align}
                  />
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="align-middle transition-colors hover:bg-surface">
              {selectable ? (
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    name="ids"
                    value={rowKey(row)}
                    aria-label="Select row"
                    className="size-4 accent-[var(--color-accent)]"
                  />
                </td>
              ) : null}

              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-3",
                    column.align === "right" && "text-right",
                    column.secondary && "hidden lg:table-cell",
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A header that re-sorts. Rendered as a link rather than a button so the sorted
 * view has its own address — an admin can bookmark or share "content by views"
 * without reproducing a sequence of clicks.
 */
function SortableHeader({
  label,
  href,
  active,
  descending,
  align,
}: {
  label: string;
  sortKey: string;
  href: string;
  active: boolean;
  descending: boolean;
  align?: "left" | "right";
}) {
  const Icon = active ? (descending ? ArrowDown : ArrowUp) : ChevronsUpDown;

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 rounded-control transition-colors",
        "hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        active ? "text-ink" : "text-ink-muted",
        align === "right" && "flex-row-reverse",
      )}
    >
      {label || <span className="sr-only">Sort</span>}
      <Icon
        className={cn("size-3 shrink-0", active ? "text-accent" : "text-ink-faint")}
        aria-hidden="true"
      />
    </Link>
  );
}
