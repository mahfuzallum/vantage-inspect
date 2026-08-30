import { notFound } from "next/navigation";
import { ContentListing } from "@/components/content/content-listing";
import { getTagBySlug } from "@/server/services/taxonomy-service";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const tag = await getTagBySlug(slug);
  if (!tag) {
    return buildMetadata({ title: "Topic not found", path: routes.tag(slug), noIndex: true });
  }

  return buildMetadata({
    title: `${tag.name} - Content`,
    description: tag.description ?? `Everything in the archive tagged ${tag.name}.`,
    path: routes.tag(tag.slug),
  });
}

export default async function TagPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const tag = await getTagBySlug(slug);
  if (!tag) notFound();

  return (
    <ContentListing
      dense
      eyebrow="Topic"
      title={tag.name}
      description={tag.description ?? undefined}
      breadcrumbs={[
        { label: "Topics", href: routes.tags },
        { label: tag.name, href: routes.tag(tag.slug) },
      ]}
      basePath={routes.tag(tag.slug)}
      searchParams={query}
      lock={{ tag: tag.slug }}
      lockedKeys={["tag"]}
      emptyDescription="Nothing carries this topic with those filters."
    />
  );
}
