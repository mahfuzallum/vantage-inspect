"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { DATE_OPTIONS, DURATION_OPTIONS } from "@/config/filters";
import { buildUrl, paramsToObject, withParam } from "@/lib/utils/url";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { SortSelect } from "./sort-dropdown";
import { cn } from "@/lib/utils/cn";
import type { DiscoveryFilters, FilterFacets, FilterKey } from "@/types/discovery";

export type FilterBarProps = {
  filters: DiscoveryFilters;
  facets: FilterFacets;
  /**
   * Filters fixed by the route itself — a category page locks `category`, so
   * that control is hidden rather than offering a contradictory choice.
   */
  locked?: FilterKey[];
  /** Left slot, typically a ResultCount. */
  summary?: ReactNode;
  className?: string;
};

type SelectFilterProps = {
  id: string;
  label: string;
  value: string | undefined;
  anyLabel: string;
  options: Array<{ value: string; label: string; count?: number }>;
  onChange: (value: string) => void;
  disabled?: boolean;
};

function SelectFilter({
  id,
  label,
  value,
  anyLabel,
  options,
  onChange,
  disabled,
}: SelectFilterProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="slate">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-9 w-full cursor-pointer rounded-control border bg-raised px-2.5 pr-8 text-sm",
          "text-ink transition-colors hover:border-line-strong",
          "focus:border-accent focus:outline-none disabled:opacity-60",
          // An applied filter is outlined in brass so it reads as active at a
          // glance, including once the drawer is closed again.
          value ? "border-accent/60" : "border-line",
        )}
      >
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.count === undefined ? option.label : `${option.label} (${option.count})`}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterBar({ filters, facets, locked = [], summary, className }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isLocked = (key: FilterKey) => locked.includes(key);

  /**
   * Every change is a soft navigation, so the URL stays the source of truth,
   * the back button steps through a filter session, and only the server
   * components below re-render.
   */
  function apply(key: string, value: string) {
    const params = withParam(searchParams, key, value || null);
    startTransition(() => router.push(buildUrl(pathname, params), { scroll: false }));
  }

  function clearAll() {
    const current = paramsToObject(searchParams);
    // Keep the query and the sort; drop only the filters the reader added.
    const kept = { q: current.q, sort: current.sort };
    startTransition(() => router.push(buildUrl(pathname, kept), { scroll: false }));
    setDrawerOpen(false);
  }

  const appliedCount = (["category", "tag", "creator", "duration", "date"] as const).filter(
    (key) => filters[key] && !isLocked(key),
  ).length;

  const controls = (
    <>
      {isLocked("category") ? null : (
        <SelectFilter
          id="filter-category"
          label="Subject"
          value={filters.category}
          anyLabel="All subjects"
          disabled={isPending}
          onChange={(value) => apply("category", value)}
          options={facets.categories.map((category) => ({
            value: category.slug,
            label: category.name,
            count: category.contentCount || undefined,
          }))}
        />
      )}

      {isLocked("tag") ? null : (
        <SelectFilter
          id="filter-tag"
          label="Topic"
          value={filters.tag}
          anyLabel="All topics"
          disabled={isPending}
          onChange={(value) => apply("tag", value)}
          options={facets.tags.map((tag) => ({
            value: tag.slug,
            label: tag.name,
            count: tag.contentCount || undefined,
          }))}
        />
      )}

      {isLocked("creator") ? null : (
        <SelectFilter
          id="filter-creator"
          label="Contributor"
          value={filters.creator}
          anyLabel="All contributors"
          disabled={isPending}
          onChange={(value) => apply("creator", value)}
          options={facets.creators.map((creator) => ({
            value: creator.slug,
            label: creator.name,
            count: creator.contentCount || undefined,
          }))}
        />
      )}

      <SelectFilter
        id="filter-duration"
        label="Length"
        value={filters.duration}
        anyLabel="Any length"
        disabled={isPending}
        onChange={(value) => apply("duration", value)}
        options={DURATION_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
      />

      <SelectFilter
        id="filter-date"
        label="Published"
        value={filters.date}
        anyLabel="Any date"
        disabled={isPending}
        onChange={(value) => apply("date", value)}
        options={DATE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
      />
    </>
  );

  return (
    <div className={cn("space-y-4 border-b border-line pb-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">{summary}</div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Below lg the filters collapse into one button; sort stays visible
              because it is the control readers reach for most often. */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            className="lg:hidden"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            Filters
            {appliedCount > 0 ? (
              <span className="ml-1 rounded-full bg-accent px-1.5 font-mono text-2xs tabular-nums text-accent-ink">
                {appliedCount}
              </span>
            ) : null}
          </Button>

          <SortSelect value={filters.sort} hasQuery={filters.query.length >= 2} />
        </div>
      </div>

      <div className="hidden gap-3 lg:grid lg:grid-cols-5">{controls}</div>

      {appliedCount > 0 ? (
        <div className="hidden lg:block">
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 text-meta text-ink-muted transition-colors hover:text-accent"
          >
            <X className="size-3.5" aria-hidden="true" />
            Clear {appliedCount === 1 ? "filter" : "all filters"}
          </button>
        </div>
      ) : null}

      {/* Built on <dialog>, so Escape and focus trapping come from the platform. */}
      <Modal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filters"
        description="Narrow the results. Changes apply as you pick them."
        footer={
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={clearAll}
              disabled={appliedCount === 0}
              className="text-meta text-ink-muted transition-colors hover:text-accent disabled:opacity-40"
            >
              Clear all
            </button>
            <Button size="sm" onClick={() => setDrawerOpen(false)}>
              Show results
            </Button>
          </div>
        }
      >
        <div className="space-y-4">{controls}</div>
      </Modal>
    </div>
  );
}
