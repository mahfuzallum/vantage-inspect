"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { Loader2, Search, X } from "lucide-react";
import { routes } from "@/config/routes";
import { cn } from "@/lib/utils/cn";

export type SearchBarSize = "default" | "large";

export type SearchBarProps = {
  initialQuery?: string;
  placeholder?: string;
  /** Visible label above the field. Otherwise the label is screen-reader only. */
  label?: string;
  size?: SearchBarSize;
  autoFocus?: boolean;
  className?: string;
};

const HEIGHT: Record<SearchBarSize, string> = {
  default: "h-10 pl-9 pr-9 text-sm",
  large: "h-12 pl-11 pr-11 text-base",
};

const ICON_INSET: Record<SearchBarSize, string> = {
  default: "left-3 size-4",
  large: "left-4 size-[1.125rem]",
};

/**
 * One search field for the whole site: header, hero, mobile drawer and the
 * search page. Navigation runs through a transition so the control can show a
 * pending state instead of appearing frozen while the results page streams.
 */
export function SearchBar({
  initialQuery = "",
  placeholder = "Search recordings, contributors, topics",
  label,
  size = "default",
  autoFocus,
  className,
}: SearchBarProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const inputId = useId();
  const hintId = `${inputId}-hint`;

  // "/" focuses search — the shortcut readers already expect from catalogues.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typingElsewhere =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (event.key === "/" && !typingElsewhere) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const query = value.trim();
    if (query.length < 2) {
      inputRef.current?.focus();
      return;
    }
    startTransition(() => router.push(routes.search(query)));
  }

  const trimmed = value.trim();

  return (
    <form role="search" onSubmit={handleSubmit} className={cn("w-full", className)}>
      <label
        htmlFor={inputId}
        className={label ? "mb-2 block text-meta font-medium text-ink" : "sr-only"}
      >
        {label ?? "Search the archive"}
      </label>

      <div className="relative flex items-center">
        <Search
          className={cn("pointer-events-none absolute text-ink-faint", ICON_INSET[size])}
          aria-hidden="true"
        />

        <input
          ref={inputRef}
          id={inputId}
          type="search"
          name="q"
          value={value}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="search"
          aria-describedby={hintId}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full rounded-control border border-line bg-raised text-ink",
            "placeholder:text-ink-faint transition-colors",
            "hover:border-line-strong focus:border-accent focus:outline-none",
            "[&::-webkit-search-cancel-button]:hidden",
            HEIGHT[size],
          )}
        />

        {isPending ? (
          <Loader2
            className={cn(
              "absolute animate-spin text-accent",
              size === "large" ? "right-4 size-[1.125rem]" : "right-3 size-4",
            )}
            aria-hidden="true"
          />
        ) : trimmed ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className={cn(
              "absolute rounded-control p-1 text-ink-faint transition-colors hover:text-ink",
              size === "large" ? "right-3" : "right-2",
            )}
          >
            <X className={size === "large" ? "size-4" : "size-3.5"} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <p id={hintId} className="sr-only">
        Enter at least two characters, then press Enter to search.
      </p>
      <span aria-live="polite" className="sr-only">
        {isPending ? "Searching" : ""}
      </span>
    </form>
  );
}
