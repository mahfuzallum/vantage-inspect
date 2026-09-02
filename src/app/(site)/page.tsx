import { Suspense } from "react";
import { Container } from "@/components/layout/container";
import { SearchBar } from "@/components/layout/search-bar";
import { Wordmark } from "@/components/layout/wordmark";
import { LiveTicker } from "@/components/home/live-ticker";
import { SectionBoundary } from "@/components/layout/section-boundary";
import { ContentListing } from "@/components/content/content-listing";
import { ContentGridSkeleton } from "@/components/ui/skeleton";
import { HomeSidebar } from "@/components/home/home-sidebar";
import { getHomeData, getSidebarCreators } from "@/server/services/home-service";
import { safeQuery } from "@/lib/db";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site";

export const revalidate = 300;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;

  return buildMetadata({
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    path: routes.home,
    // Page 2+ self-canonicalises and drops out of the index.
    page: Number.parseInt(raw ?? "1", 10) || 1,
  });
}

/**
 * The front page is the archive itself.
 *
 * Not a landing page with a tall hero and a series of curated shelves — a
 * catalogue this size is browsed, not read, so the first screen is a dense
 * grid with the filters and pagination needed to work through it. The masthead
 * is kept to a headline and a search field.
 *
 * The grid is `ContentListing`, the same component behind /latest, /popular
 * and every category page, so filtering, sorting, counting and paging behave
 * identically here and there.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <>
      <Masthead />

      <SectionBoundary label="live-ticker">
        <Suspense fallback={null}>
          <TickerSlot />
        </Suspense>
      </SectionBoundary>

      {/* Rail and grid side by side. The rail hides below xl, so the grid
          takes the full width on narrower screens rather than being squeezed
          into a column too tight to read. */}
      <div className="flex">
        <Suspense fallback={null}>
          <SidebarSlot />
        </Suspense>

        <div className="min-w-0 flex-1">
          <Suspense fallback={<HomeGridFallback />}>
            <ContentListing
              dense
              columns={6}
              monetizationPlacement="home"
              hideHeading
              eyebrow="Recordings"
              title={siteConfig.name}
              basePath={routes.home}
              searchParams={params}
              defaultSort="newest"
              // Only tag and sort are offered. The rest of the facets describe
              // properties this archive does not record, so showing the
              // controls would promise filtering that cannot work.
              lockedKeys={["category", "creator", "duration", "date"]}
              emptyTitle="Nothing here yet"
              emptyDescription="Published recordings will appear as soon as they are added."
            />
          </Suspense>
        </div>
      </div>

    </>
  );
}

/** Compact header: name, one line, and the search field. */
function Masthead() {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.07]">
      <div
        aria-hidden="true"
        className="animate-ambient pointer-events-none absolute left-1/2 top-[-16rem] h-[24rem] w-[40rem] -translate-x-1/2 rounded-full bg-[#8B5CF6]/[0.16] blur-[110px]"
      />
      <Container className="relative py-8 text-center sm:py-10">
        <h1>
          <Wordmark name={siteConfig.shortName} tagline={siteConfig.tagline} highlight="webcam" />
        </h1>

        <div className="mx-auto mt-5 max-w-2xl rounded-xl border border-white/[0.08] bg-white/[0.035] p-1.5 shadow-[0_16px_50px_rgba(0,0,0,0.3)] backdrop-blur">
          <SearchBar size="large" className="w-full" placeholder="Find as you type..." />
        </div>
      </Container>
    </section>
  );
}

/**
 * The ticker in its own async boundary, so a slow or failing query for it
 * cannot delay the grid — which is what the visitor actually came for.
 */
async function TickerSlot() {
  const data = await getHomeData();
  return <LiveTicker items={data.ticker} />;
}

function HomeGridFallback() {
  return (
    <Container className="py-8 sm:py-10">
      <ContentGridSkeleton count={12} />
    </Container>
  );
}

/** The rail in its own boundary, so its queries cannot delay the grid. */
async function SidebarSlot() {
  const { recent, popular } = await safeQuery(() => getSidebarCreators(), {
    recent: [],
    popular: [],
  });

  if (recent.length === 0 && popular.length === 0) return null;
  return <HomeSidebar recent={recent} popular={popular} />;
}
