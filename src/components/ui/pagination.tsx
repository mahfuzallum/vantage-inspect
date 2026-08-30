import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type PaginationProps = {
  page: number;
  totalPages: number;
  /** Returns the href for a page, preserving the current query and filters. */
  buildHref: (page: number) => string;
  className?: string;
};

/** First, last, and a window around the current page. */
function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages = new Set<number>([1, totalPages, page]);
  for (const offset of [-1, 1]) {
    const candidate = page + offset;
    if (candidate > 1 && candidate < totalPages) pages.add(candidate);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const output: Array<number | "gap"> = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) output.push("gap");
    output.push(value);
    previous = value;
  }
  return output;
}

const CELL =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-control border px-2 " +
  "font-mono text-2xs tabular-nums transition-colors";

/**
 * Edges render as a disabled span rather than disappearing, so the control
 * keeps its shape and position between pages instead of shifting sideways.
 */
function EdgeLink({
  href,
  disabled,
  label,
  children,
  rel,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
  rel?: string;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={`${label} (unavailable)`}
        className={cn(CELL, "cursor-not-allowed border-line/60 text-ink-faint/50")}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      rel={rel}
      aria-label={label}
      className={cn(CELL, "border-line text-ink-muted hover:border-accent hover:text-accent")}
    >
      {children}
    </Link>
  );
}

export function Pagination({ page, totalPages, buildHref, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-1.5", className)}
    >
      <EdgeLink href={buildHref(page - 1)} disabled={page <= 1} label="Previous page" rel="prev">
        <ChevronLeft className="size-4" aria-hidden="true" />
      </EdgeLink>

      {/* Page numbers are hidden on the narrowest screens, where the position
          indicator below carries the same information in less space. */}
      <span className="hidden items-center gap-1.5 sm:flex">
        {pageWindow(page, totalPages).map((entry, index) =>
          entry === "gap" ? (
            <span key={`gap-${index}`} className="px-1 text-ink-faint" aria-hidden="true">
              &hellip;
            </span>
          ) : (
            <Link
              key={entry}
              href={buildHref(entry)}
              aria-label={`Page ${entry}`}
              aria-current={entry === page ? "page" : undefined}
              className={cn(
                CELL,
                entry === page
                  ? "border-accent bg-accent/12 text-accent"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {entry}
            </Link>
          ),
        )}
      </span>

      <span className="slate px-2 tabular-nums sm:hidden">
        {page} / {totalPages}
      </span>

      <EdgeLink
        href={buildHref(page + 1)}
        disabled={page >= totalPages}
        label="Next page"
        rel="next"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </EdgeLink>
    </nav>
  );
}
