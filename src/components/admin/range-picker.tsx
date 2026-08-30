"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { RANGE_OPTIONS, type RangeOption } from "@/config/analytics";
import { buildUrl, withParam } from "@/lib/utils/url";
import { cn } from "@/lib/utils/cn";

/**
 * Date-range control. Writes to the URL like every other filter in the app,
 * so an admin view stays shareable and survives a reload.
 */
export function RangePicker({ value }: { value: RangeOption }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label="Date range"
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-control border border-line bg-surface p-1",
        isPending && "opacity-60",
      )}
    >
      {RANGE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={isPending}
          onClick={() => {
            const params = withParam(searchParams, "range", option.value);
            startTransition(() => router.push(buildUrl(pathname, params), { scroll: false }));
          }}
          className={cn(
            "rounded px-2.5 py-1 text-meta transition-colors",
            option.value === value
              ? "bg-accent text-accent-ink"
              : "text-ink-muted hover:bg-raised hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
