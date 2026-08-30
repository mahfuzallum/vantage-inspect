import { ContentListing } from "@/components/content/content-listing";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;

  return buildMetadata({
    title: "Featured Content",
    description: "Recordings selected by the archive editors.",
    path: routes.featured,
    // Page 2+ self-canonicalises and drops out of the index.
    page: Number.parseInt(raw ?? "1", 10) || 1,
  });
}

export default async function FeaturedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ContentListing
      dense
      eyebrow="Editor's selection"
      title="Featured Content"
      description="Recordings selected by the archive editors."
      basePath={routes.featured}
      searchParams={await searchParams}
      defaultSort="newest"
      lock={{ featuredOnly: true }}
      emptyTitle="Nothing is featured right now"
      emptyDescription="Featured items are chosen weekly. Browse the latest additions in the meantime."
    />
  );
}
