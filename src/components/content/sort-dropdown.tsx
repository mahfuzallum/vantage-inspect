"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { sortOptionsFor, type SortOption } from "@/config/filters";
import { buildUrl, withParam } from "@/lib/utils/url";
import { cn } from "@/lib/utils/cn";

export type SortSelectProps = {
  value: SortOption;
  /** Relevance is offered only when there is a query to rank against. */
  hasQuery: boolean;
  className?: string;
};

/**
 * Native <select> rather than a custom listbox: it is keyboard accessible and
 * screen-reader correct for free, and on mobile it opens the platform picker.
 */
export function SortSelect({ value, hasQuery, className }: SortSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    const params = withParam(searchParams, "sort", next);
    startTransition(() => router.push(buildUrl(pathname, params), { scroll: false }));
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor="sort-select" className="slate shrink-0">
        Sort
      </label>
      <select
        id="sort-select"
        value={value}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
        className={cn(
          "h-9 cursor-pointer rounded-control border border-line bg-raised px-2.5 pr-8 text-sm",
          "text-ink transition-colors hover:border-line-strong focus:border-accent focus:outline-none",
          "disabled:opacity-60",
        )}
      >
        {sortOptionsFor(hasQuery).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
