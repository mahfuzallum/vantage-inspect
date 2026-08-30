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
    title: "Latest Content",
    description: "Everything added to the archive, newest first.",
    path: routes.latest,
    // Page 2+ self-canonicalises and drops out of the index.
    page: Number.parseInt(raw ?? "1", 10) || 1,
  });
}

export default async function LatestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ContentListing
      dense
      eyebrow="Recently added"
      title="Latest Content"
      description="Everything added to the archive, newest first."
      basePath={routes.latest}
      searchParams={await searchParams}
      defaultSort="newest"
    />
  );
}
