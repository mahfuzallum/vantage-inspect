"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { FormEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { buildUrl, withParam } from "@/lib/utils/url";
import { cn } from "@/lib/utils/cn";

/**
 * Admin search box. Submits into the URL like the public filters do, so the
 * server does the querying and an admin view stays shareable and reloadable.
 */
export function AdminSearch({
  placeholder = "Search…",
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q")?.toString() ?? "";
    const params = withParam(searchParams, "q", value.trim() || null);
    startTransition(() => router.push(buildUrl(pathname, params), { scroll: false }));
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={cn("relative", className)}>
      <label htmlFor="admin-search" className="sr-only">
        {placeholder}
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
        aria-hidden="true"
      />
      <input
        id="admin-search"
        name="q"
        type="search"
        defaultValue={searchParams.get("q") ?? ""}
        placeholder={placeholder}
        className="h-9 w-full rounded-control border border-line bg-raised pl-9 pr-9 text-sm text-ink placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:outline-none"
      />
      {isPending ? (
        <Loader2
          className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-accent"
          aria-hidden="true"
        />
      ) : null}
    </form>
  );
}

export type FilterOption = { value: string; label: string };

/** URL-driven dropdown filter, matching the public filter behaviour. */
export function AdminFilter({
  name,
  label,
  options,
  anyLabel = "All",
}: {
  name: string;
  label: string;
  options: FilterOption[];
  anyLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const current = searchParams.get(name) ?? "";

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={`filter-${name}`} className="slate shrink-0">
        {label}
      </label>
      <select
        id={`filter-${name}`}
        value={current}
        disabled={isPending}
        onChange={(event) => {
          const params = withParam(searchParams, name, event.target.value || null);
          startTransition(() => router.push(buildUrl(pathname, params), { scroll: false }));
        }}
        className={cn(
          "h-9 cursor-pointer rounded-control border bg-raised px-2.5 pr-8 text-sm text-ink",
          "hover:border-line-strong focus:border-accent focus:outline-none disabled:opacity-60",
          current ? "border-accent/60" : "border-line",
        )}
      >
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
