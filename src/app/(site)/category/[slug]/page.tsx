import { notFound } from "next/navigation";
import { ContentListing } from "@/components/content/content-listing";
import { getCategoryBySlug } from "@/server/services/taxonomy-service";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) {
    return buildMetadata({
      title: "Subject not found",
      path: routes.category(slug),
      noIndex: true,
    });
  }

  return buildMetadata({
    title: category.seoTitle ?? `${category.name} - Content`,
    description: category.seoDescription ?? category.description,
    path: routes.category(category.slug),
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await getCategoryBySlug(slug);

  // An unknown or retired subject is a 404, not an empty grid.
  if (!category) notFound();

  return (
    <ContentListing
      dense
      eyebrow="Subject"
      title={category.name}
      description={category.description ?? undefined}
      breadcrumbs={[
        { label: "Subjects", href: routes.categories },
        { label: category.name, href: routes.category(category.slug) },
      ]}
      basePath={routes.category(category.slug)}
      searchParams={query}
      lock={{ category: category.slug }}
      lockedKeys={["category"]}
      emptyDescription="Nothing is catalogued under this subject with those filters."
    />
  );
}
