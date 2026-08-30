import { Container } from "@/components/layout/container";
import { CreatorCard } from "@/components/content/creator-card";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { ResultCount } from "@/components/content/result-count";
import { DemoNotice } from "@/components/home/demo-notice";
import { findCreatorPage } from "@/server/services/discovery-service";
import { normalizePage } from "@/config/pagination";
import { buildUrl } from "@/lib/utils/url";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Contributors",
  description: "People and organisations whose recordings are held in the archive.",
  path: routes.creators,
});

export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;
  const result = await findCreatorPage(normalizePage(raw));

  return (
    <>
      {result.isDemo ? <DemoNotice /> : null}

      <Container className="py-8 sm:py-10">
        <header className="mb-8 space-y-2">
          <p className="slate slate-accent">Index</p>
          <h1 className="font-display text-page font-semibold sm:text-3xl">Contributors</h1>
          <p className="max-w-2xl text-meta leading-relaxed text-ink-muted">
            People and organisations whose recordings are held here.
          </p>
        </header>

        <div className="mb-6 border-b border-line pb-4">
          <ResultCount
            total={result.total}
            singular="contributor"
            zeroLabel="No contributors yet"
          />
        </div>

        {result.items.length === 0 ? (
          <EmptyState
            title="No contributors yet"
            description="Contributors appear here once their first recording is published."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((creator) => (
              <CreatorCard key={creator.id} creator={creator} />
            ))}
          </div>
        )}

        <Pagination
          className="mt-12"
          page={result.page}
          totalPages={result.totalPages}
          buildHref={(page) => buildUrl(routes.creators, { page: page > 1 ? page : undefined })}
        />
      </Container>
    </>
  );
}
