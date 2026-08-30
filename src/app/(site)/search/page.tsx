import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SearchBar } from "@/components/layout/search-bar";
import { ContentGrid } from "@/components/content/content-grid";
import { FilterBar } from "@/components/content/filter-bar";
import { ResultCount } from "@/components/content/result-count";
import { CreatorCard } from "@/components/content/creator-card";
import { Pagination } from "@/components/ui/pagination";
import { EmptySearchState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { DemoNotice } from "@/components/home/demo-notice";
import { findContent, findCreators, getFilterFacets } from "@/server/services/discovery-service";
import { parseDiscoveryParams } from "@/validation/discovery";
import { buildUrl } from "@/lib/utils/url";
import { normalizeQuery } from "@/lib/security/sanitize";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = normalizeQuery(raw);

  return buildMetadata({
    title: query ? `Search results for "${query}"` : "Search the archive",
    description: "Search recordings by title, contributor, subject or topic.",
    path: routes.search(query || undefined),
    // Useful to readers, not something an index should hold.
    noIndex: true,
  });
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseDiscoveryParams(params);
  const hasQuery = filters.query.length >= 2;

  // Nothing is queried until there is something to query for.
  const [result, creators, facets] = await Promise.all([
    hasQuery ? findContent(filters) : null,
    hasQuery && filters.page === 1 ? findCreators(filters.query) : null,
    getFilterFacets(),
  ]);

  function hrefForPage(page: number): string {
    return buildUrl(routes.search(), {
      q: filters.query,
      category: filters.category,
      tag: filters.tag,
      creator: filters.creator,
      duration: filters.duration,
      date: filters.date,
      sort: filters.sort,
      page: page > 1 ? page : undefined,
    });
  }

  const showCreators = Boolean(creators && creators.items.length > 0);

  return (
    <>
      {result?.isDemo ? <DemoNotice /> : null}

      <Container className="py-8 sm:py-10">
        <header className="mb-8 space-y-4">
          <p className="slate slate-accent">Search</p>
          <h1 className="font-display text-page font-semibold sm:text-3xl">
            {hasQuery ? (
              <>
                Results for <span className="text-accent">&ldquo;{filters.query}&rdquo;</span>
              </>
            ) : (
              "Search the archive"
            )}
          </h1>

          {/* Seeded from the URL, so a shared link reopens the exact search it
              was copied from. */}
          <SearchBar
            size="large"
            className="max-w-2xl"
            initialQuery={filters.query}
            autoFocus={!hasQuery}
            placeholder="Search by title, contributor or topic"
          />
        </header>

        {!hasQuery ? (
          <EmptySearchState />
        ) : (
          <>
            <FilterBar
              className="mb-6"
              filters={filters}
              facets={facets}
              summary={
                <ResultCount total={result?.total ?? 0} singular="result" plural="results" />
              }
            />

            {showCreators && creators ? (
              <section aria-labelledby="creator-results" className="mb-10">
                <h2 id="creator-results" className="slate mb-3">
                  Contributors
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {creators.items.map((creator) => (
                    <CreatorCard key={creator.id} creator={creator} />
                  ))}
                </div>
              </section>
            ) : null}

            {result && result.items.length === 0 ? (
              <EmptySearchState
                query={filters.query}
                action={
                  <Button asChild variant="outline">
                    <Link href={routes.latest}>Browse the latest instead</Link>
                  </Button>
                }
              />
            ) : (
              <>
                {showCreators ? <h2 className="slate mb-3">Recordings</h2> : null}
                <ContentGrid items={result?.items ?? []} />
              </>
            )}

            <Pagination
              className="mt-12"
              page={result?.page ?? 1}
              totalPages={result?.totalPages ?? 0}
              buildHref={hrefForPage}
            />
          </>
        )}
      </Container>
    </>
  );
}
