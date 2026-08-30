"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BadgeCheck, Check, Loader2, Plus, Search, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils/cn";

export type CreatorOption = {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  isVerified: boolean;
  contentCount: number;
};

/**
 * Contributor picker for the upload screen.
 *
 * Searches the server rather than filtering a preloaded list, because the
 * roster is unbounded and the box shows a handful of rows at a time. When a
 * search returns nothing, creating the contributor is offered right there —
 * the moment you discover someone is missing is the moment you want to add
 * them, and sending an admin to another screen loses the upload in progress.
 */
export function CreatorPicker({
  value,
  onChange,
  error,
}: {
  value: CreatorOption | null;
  onChange: (creator: CreatorOption | null) => void;
  error?: string;
}) {
  const inputId = useId();
  const listId = `${inputId}-list`;
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<CreatorOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebouncedValue(query, 250);
  const trimmed = debouncedQuery.trim();

  const load = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/admin/creators${search ? `?q=${encodeURIComponent(search)}` : ""}`,
      );
      if (!response.ok) throw new Error("lookup failed");
      const body = (await response.json()) as { data?: { creators?: CreatorOption[] } };
      setOptions(body.data?.creators ?? []);
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load(trimmed);
  }, [open, trimmed, load]);

  // A click anywhere else closes the list, the way a native select behaves.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function createCreator() {
    const name = query.trim();
    if (name.length < 2) return;

    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/admin/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await response.json()) as {
        data?: { creator?: CreatorOption };
        error?: { message?: string };
      };

      if (!response.ok || !body.data?.creator) {
        setCreateError(body.error?.message ?? "That contributor could not be created.");
        return;
      }

      onChange(body.data.creator);
      setQuery("");
      setOpen(false);
    } catch {
      setCreateError("That contributor could not be created.");
    } finally {
      setCreating(false);
    }
  }

  if (value) {
    return (
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-ink">
          Contributor
          <span className="ml-1 text-accent" aria-hidden="true">
            *
          </span>
        </span>

        <div className="flex items-center gap-3 rounded-control border border-accent/40 bg-accent/[0.06] px-3 py-2.5">
          <Avatar name={value.name} src={value.avatarUrl} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium text-ink">{value.name}</span>
              {value.isVerified ? (
                <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="Verified" />
              ) : null}
            </div>
            <span className="slate">
              {value.contentCount} {value.contentCount === 1 ? "recording" : "recordings"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            className="rounded-control p-1.5 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            aria-label="Choose a different contributor"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const canCreate = trimmed.length >= 2 && !loading;
  const exactMatch = options.some(
    (option) => option.name.toLowerCase() === trimmed.toLowerCase(),
  );

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        Contributor
        <span className="ml-1 text-accent" aria-hidden="true">
          *
        </span>
      </label>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
          aria-hidden="true"
        />
        <Input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Search contributors…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          aria-invalid={Boolean(error)}
          className="pl-9"
        />
        {loading ? (
          <Loader2
            className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-faint"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          Not listed yet? Type the name and add them without leaving this page.
        </p>
      )}

      {open ? (
        <div
          id={listId}
          role="listbox"
          className={cn(
            "absolute z-30 mt-1 max-h-72 w-full overflow-y-auto",
            "rounded-card border border-line bg-surface shadow-raised",
          )}
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => {
                onChange(option);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-raised"
            >
              <Avatar name={option.name} src={option.avatarUrl} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm text-ink">{option.name}</span>
                  {option.isVerified ? (
                    <BadgeCheck className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
                  ) : null}
                </span>
                <span className="slate">{option.contentCount} recordings</span>
              </span>
              <Check className="size-4 shrink-0 text-transparent" aria-hidden="true" />
            </button>
          ))}

          {options.length === 0 && !loading ? (
            <p className="px-3 py-3 text-sm text-ink-muted">
              {trimmed ? `No contributor matches “${trimmed}”.` : "No contributors yet."}
            </p>
          ) : null}

          {canCreate && !exactMatch ? (
            <div className="border-t border-line p-2">
              <button
                type="button"
                onClick={() => void createCreator()}
                disabled={creating}
                className={cn(
                  "flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-sm",
                  "text-accent transition-colors hover:bg-accent/10 disabled:opacity-60",
                )}
              >
                {creating ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <UserPlus className="size-4" aria-hidden="true" />
                )}
                <span className="truncate">
                  {creating ? "Adding…" : `Add “${trimmed}” as a new contributor`}
                </span>
                {!creating ? <Plus className="ml-auto size-3.5" aria-hidden="true" /> : null}
              </button>
              {createError ? (
                <p role="alert" className="px-2.5 pt-1.5 text-sm text-critical">
                  {createError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
