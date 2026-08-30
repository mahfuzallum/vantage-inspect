import { notFound } from "next/navigation";
import Link from "next/link";
import { ArchiveGrid } from "@/components/content/archive-card";
import { CreatorProfileHeader } from "@/components/content/creator-profile-header";
import { FilterBar } from "@/components/content/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { ResultCount } from "@/components/content/result-count";
import { DemoNotice } from "@/components/home/demo-notice";
import {
  findContent,
  findCreatorProfile,
  getFilterFacets,
} from "@/server/services/discovery-service";
import { parseDiscoveryParams } from "@/validation/discovery";
import { buildUrl } from "@/lib/utils/url";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  creatorJsonLd,
  jsonLdScript,
} from "@/lib/seo/structured-data";
import { routes } from "@/config/routes";
import { cn } from "@/lib/utils/cn";

export const revalidate = 60;

/** Orderings offered above a contributor's recordings. Recent is the default. */
const SORT_TABS = [
  { value: "newest", label: "Recent" },
  { value: "popular", label: "Viewed" },
  { value: "liked", label: "Liked" },
  { value: "bookmarked", label: "Bookmarked" },
  { value: "oldest", label: "Oldest" },
] as const;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const creator = await findCreatorProfile(slug);

  if (!creator) {
    return buildMetadata({
      title: "Creator not found",
      path: routes.creator(slug),
      noIndex: true,
    });
  }

  return buildMetadata({
    title: creator.seoTitle ?? `${creator.name} - Creator`,
    description:
      creator.seoDescription ??
      creator.bio ??
      `Videos from ${creator.name}.`,
    path: routes.creator(creator.slug),
    image: creator.avatarUrl,
    type: "profile",
  });
}

export default async function CreatorPage({
  params,
  searchParams,
}: Props) {
  const [{ slug }, query] = await Promise.all([
    params,
    searchParams,
  ]);

  const creator = await findCreatorProfile(slug);

  if (!creator) notFound();

  const filters = parseDiscoveryParams(query, {
    lock: { creator: creator.slug },
  });

  const [result, facets] = await Promise.all([
    findContent(filters),
    getFilterFacets(),
  ]);

  const hrefForPage = (page: number) =>
    buildUrl(routes.creator(creator.slug), {
      sort: filters.sort === "newest" ? undefined : filters.sort,
      page: page > 1 ? page : undefined,
      tag: filters.tag,
      duration: filters.duration,
      date: filters.date,
    });

  return (
    <>
      {result.isDemo ? <DemoNotice /> : null}

      <main className="profile-page w-full">
        <div
          className={cn(
            "mx-auto grid w-full",
            "max-w-[1900px]",
            "gap-5 px-4 py-8",
            "sm:px-6",
            "lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8 lg:py-10",
            "xl:grid-cols-[280px_minmax(0,1fr)] xl:gap-6",
            "2xl:px-10",
          )}
        >
          <CreatorProfileHeader
            name={creator.name}
            avatarUrl={creator.avatarUrl}
            bannerUrl={creator.bannerUrl}
            bio={creator.bio}
            isVerified={creator.isVerified}
            contentCount={creator.contentCount}
            totalViews={creator.totalViews}
            joinedAt={creator.joinedAt}
            websiteUrl={creator.websiteUrl}
            socialLinks={creator.socialLinks}
            className="lg:sticky lg:top-24 lg:self-start"
          />

          <section className="min-w-0 w-full">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.07] pb-4">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A78BFA]">
                  <span className="h-3 w-0.5 rounded-full bg-[#8B5CF6]" />
                  Creator archive
                </div>

                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Videos
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.07] bg-[#111118] p-1 text-xs">
                {SORT_TABS.map((tab) => {
                  const active =
                    tab.value === "newest"
                      ? filters.sort === "newest"
                      : filters.sort === tab.value;

                  return (
                    <Link
                      key={tab.value}
                      href={buildUrl(routes.creator(creator.slug), {
                        sort:
                          tab.value === "newest"
                            ? undefined
                            : tab.value,
                      })}
                      className={cn(
                        "rounded-lg px-3 py-2 transition",
                        active
                          ? "bg-[#8B5CF6]/15 text-[#C4B5FD]"
                          : "text-white/45 hover:text-white",
                      )}
                    >
                      {tab.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            <FilterBar
              className="mb-6"
              filters={filters}
              facets={facets}
              locked={["creator", "category", "duration", "date"]}
              summary={<ResultCount total={result.total} />}
            />

            <ArchiveGrid
              items={result.items}
              priorityCount={5}
              columns={5}
              className="w-full"
            />

            <Pagination
              className="mt-12"
              page={result.page}
              totalPages={result.totalPages}
              buildHref={hrefForPage}
            />

            {creator.about ? (
              <section
                aria-labelledby="creator-about"
                className="mt-14 border-t border-white/[0.07] pt-8"
              >
                <h2
                  id="creator-about"
                  className="font-display text-xl font-bold tracking-tight text-white"
                >
                  About {creator.name}
                </h2>

                <div className="mt-4 max-w-2xl space-y-4 text-sm leading-7 text-white/60">
                  {creator.about
                    .split(/\n{2,}/)
                    .map(
                      (paragraph, index) =>
                        paragraph.trim() && (
                          <p key={index}>{paragraph.trim()}</p>
                        ),
                    )}
                </div>
              </section>
            ) : null}
          </section>
        </div>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            creatorJsonLd({
              name: creator.name,
              slug: creator.slug,
              bio: creator.bio,
              avatarUrl: creator.avatarUrl,
              websiteUrl: creator.websiteUrl,
            }),
          ),
        }}
      />
    </>
  );
}