import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { ContentGrid } from "./content-grid";
import { ArchiveGrid } from "./archive-card";
import { EmptyState } from "@/components/ui/states";
import { FilterBar } from "./filter-bar";
import { ResultCount } from "./result-count";
import { Pagination } from "@/components/ui/pagination";
import {
  Breadcrumbs,
  type Crumb,
} from "@/components/ui/breadcrumbs";
import { DemoNotice } from "@/components/home/demo-notice";
import {
  findContent,
  getFilterFacets,
} from "@/server/services/discovery-service";
import { parseDiscoveryParams } from "@/validation/discovery";
import { buildUrl } from "@/lib/utils/url";
import type {
  DiscoveryFilters,
  FilterKey,
} from "@/types/discovery";
import type { SortOption } from "@/config/filters";

export type ContentListingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  masthead?: ReactNode;
  basePath: string;
  searchParams: Record<
    string,
    string | string[] | undefined
  >;
  lock?: Partial<
    Pick<
      DiscoveryFilters,
      "category" | "tag" | "creator" | "featuredOnly"
    >
  >;
  lockedKeys?: FilterKey[];
  defaultSort?: SortOption;
  showFilters?: boolean;
  hideHeading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  dense?: boolean;
  columns?: 4 | 5 | 6 | 7;
};

export async function ContentListing({
  eyebrow,
  title,
  description,
  breadcrumbs,
  masthead,
  basePath,
  searchParams,
  lock,
  lockedKeys = [],
  defaultSort,
  showFilters = true,
  hideHeading = false,
  emptyTitle,
  emptyDescription,
  dense = false,
  columns = 4,
}: ContentListingProps) {
  const filters = parseDiscoveryParams(
    searchParams,
    {
      lock,
      defaultSort,
    },
  );

  const [result, facets] =
    await Promise.all([
      findContent(filters),
      getFilterFacets(),
    ]);

  function hrefForPage(
    page: number,
  ): string {
    return buildUrl(
      basePath,
      {
        q:
          filters.query ||
          undefined,

        category:
          lockedKeys.includes(
            "category",
          )
            ? undefined
            : filters.category,

        tag:
          lockedKeys.includes("tag")
            ? undefined
            : filters.tag,

        creator:
          lockedKeys.includes(
            "creator",
          )
            ? undefined
            : filters.creator,

        duration:
          filters.duration,

        date:
          filters.date,

        sort:
          filters.sort,

        page:
          page > 1
            ? page
            : undefined,
      },
    );
  }

  return (
    <>
      {result.isDemo ? (
        <DemoNotice />
      ) : null}

      <Container
        width="wide"
        className="py-6 sm:py-8"
      >
        {breadcrumbs ? (
          <Breadcrumbs
            trail={breadcrumbs}
            className="mb-4"
          />
        ) : null}

        {hideHeading ? (
          <p className="slate slate-accent mb-4">
            {eyebrow}
          </p>
        ) : (
          <header className="mb-8 space-y-2">
            <p className="slate slate-accent">
              {eyebrow}
            </p>

            <h1 className="font-display text-page font-semibold sm:text-3xl">
              {title}
            </h1>

            {description ? (
              <p className="max-w-2xl text-meta leading-relaxed text-ink-muted">
                {description}
              </p>
            ) : null}
          </header>
        )}

        {masthead}

        {showFilters ? (
          <FilterBar
            className="mb-6"
            filters={filters}
            facets={facets}
            locked={lockedKeys}
            summary={
              <ResultCount
                total={result.total}
              />
            }
          />
        ) : null}

        {dense ? (
          result.items.length === 0 ? (
            <EmptyState
              title={
                emptyTitle ??
                "Nothing matches those filters"
              }
              description={
                emptyDescription ??
                "Try removing a filter or searching instead."
              }
            />
          ) : (
            <ArchiveGrid
              items={result.items}
              priorityCount={columns}
              columns={columns}
            />
          )
        ) : (
          <ContentGrid
            items={result.items}
            emptyTitle={emptyTitle}
            emptyDescription={
              emptyDescription
            }
          />
        )}

        <Pagination
          className="mt-12"
          page={result.page}
          totalPages={result.totalPages}
          buildHref={hrefForPage}
        />
      </Container>
    </>
  );
}