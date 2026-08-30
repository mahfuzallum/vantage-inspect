"use client";

import { useCallback, useEffect, useState } from "react";
import { useActionState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Search, X } from "lucide-react";
import { updateHomeSettingsAction } from "@/server/actions/admin-settings";
import { initialAdminState } from "@/server/actions/admin-form-state";
import { FormSection } from "./admin-shell";
import { TextField } from "@/components/forms/text-field";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { Input, Textarea } from "@/components/ui/input";
import { Thumbnail } from "@/components/ui/thumbnail";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils/cn";

export type FeaturedItem = {
  id: string;
  title: string;
  slug: string;
  creatorName: string | null;
  thumbnailUrl: string | null;
};

export type HomeSettingsValues = {
  heroTitle: string;
  heroDescription: string;
  quickLinks: string;
  featured: FeaturedItem[];
};

/** Positions the home page actually has, in the order it renders them. */
const SLOT_LABELS = ["Large slot", "Small slot 1", "Small slot 2", "Small slot 3"];

export function HomeSettingsForm({ values }: { values: HomeSettingsValues }) {
  const [state, action] = useActionState(updateHomeSettingsAction, initialAdminState);
  const [featured, setFeatured] = useState<FeaturedItem[]>(values.featured);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FeaturedItem[]>([]);
  const [searching, setSearching] = useState(false);
  const debounced = useDebouncedValue(query, 250);

  const search = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await fetch(
        `/api/admin/content/search?q=${encodeURIComponent(term.trim())}`,
      );
      const body = (await response.json()) as { data?: { items?: FeaturedItem[] } };
      setResults(body.data?.items ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    void search(debounced);
  }, [debounced, search]);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= featured.length) return;
    setFeatured((previous) => {
      const next = [...previous];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  const chosenIds = new Set(featured.map((item) => item.id));

  return (
    <form action={action} className="space-y-6">
      <FormMessage status={state.status} message={state.message} />

      <FormSection
        title="Headline"
        description="The first thing a visitor reads. Shown above the search box."
      >
        <TextField
          label="Headline"
          name="heroTitle"
          required
          defaultValue={values.heroTitle}
          errors={state.fieldErrors?.heroTitle}
        />

        <div className="space-y-1.5">
          <label htmlFor="heroDescription" className="block text-sm font-medium text-ink">
            Introduction
          </label>
          <Textarea
            id="heroDescription"
            name="heroDescription"
            rows={3}
            maxLength={300}
            defaultValue={values.heroDescription}
          />
          <p className="text-sm text-ink-muted">One or two sentences. Leave blank to hide it.</p>
        </div>

        <TextField
          label="Shortcut tags"
          name="quickLinks"
          defaultValue={values.quickLinks}
          hint="Comma-separated. Each becomes a #tag under the search box and links to that search."
          errors={state.fieldErrors?.quickLinks}
        />
      </FormSection>

      <FormSection
        title="Featured lineup"
        description="The first recording fills the large slot; the next three fill the small ones. Anything beyond four is kept but not shown."
      >
        {featured.length === 0 ? (
          <p className="rounded-control border border-dashed border-line px-3 py-6 text-center text-sm text-ink-muted">
            Nothing chosen yet. Search below to add the first recording.
          </p>
        ) : (
          <ol className="space-y-2">
            {featured.map((item, index) => (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-3 rounded-control border px-3 py-2.5",
                  index < 4 ? "border-line bg-raised" : "border-dashed border-line opacity-60",
                )}
              >
                <input type="hidden" name="featuredOrder" value={item.id} />

                <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded border border-line bg-sunken">
                  <Thumbnail src={item.thumbnailUrl} alt="" seed={item.slug} sizes="5rem" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                  <p className="slate">
                    {SLOT_LABELS[index] ?? "Not shown"}
                    {item.creatorName ? ` · ${item.creatorName}` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${item.title} up`}
                    className="rounded-control p-1.5 text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-30"
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === featured.length - 1}
                    aria-label={`Move ${item.title} down`}
                    className="rounded-control p-1.5 text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-30"
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFeatured((previous) => previous.filter((entry) => entry.id !== item.id))
                    }
                    aria-label={`Remove ${item.title}`}
                    className="rounded-control p-1.5 text-ink-muted transition-colors hover:bg-surface hover:text-critical"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="space-y-2 border-t border-line pt-4">
          <label htmlFor="featured-search" className="block text-sm font-medium text-ink">
            Add a recording
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <Input
              id="featured-search"
              type="search"
              autoComplete="off"
              placeholder="Search published recordings by title…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
            />
            {searching ? (
              <Loader2
                className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-faint"
                aria-hidden="true"
              />
            ) : null}
          </div>

          {results.length > 0 ? (
            <ul className="divide-y divide-line rounded-control border border-line">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={chosenIds.has(item.id)}
                    onClick={() => {
                      setFeatured((previous) => [...previous, item]);
                      setQuery("");
                      setResults([]);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-raised disabled:opacity-40"
                  >
                    <div className="relative aspect-video w-16 shrink-0 overflow-hidden rounded border border-line bg-sunken">
                      <Thumbnail src={item.thumbnailUrl} alt="" seed={item.slug} sizes="4rem" />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{item.title}</span>
                      {item.creatorName ? (
                        <span className="slate">{item.creatorName}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-ink-faint">
                      {chosenIds.has(item.id) ? (
                        <span className="slate">Added</span>
                      ) : (
                        <Plus className="size-4" aria-hidden="true" />
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : debounced.trim().length >= 2 && !searching ? (
            <p className="text-sm text-ink-muted">
              No published recording matches that. Only published records can be featured.
            </p>
          ) : null}
        </div>
      </FormSection>

      <SubmitButton pendingLabel="Saving…">Save home page</SubmitButton>
    </form>
  );
}
