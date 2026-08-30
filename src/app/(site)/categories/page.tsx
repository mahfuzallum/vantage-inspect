import { Container } from "@/components/layout/container";
import { CategoryCard } from "@/components/content/category-card";
import { EmptyState } from "@/components/ui/states";
import { ResultCount } from "@/components/content/result-count";
import { getFilterFacets } from "@/server/services/discovery-service";
import { CATEGORY_DESCRIPTIONS } from "@/lib/mock/catalogue";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const revalidate = 600;

export const metadata = buildMetadata({
  title: "Subjects",
  description: "Every subject area held in the archive, with the size of each.",
  path: routes.categories,
});

export default async function CategoriesPage() {
  const facets = await getFilterFacets();
  const categories = facets.categories;

  return (
    <Container className="py-8 sm:py-10">
      <header className="mb-8 space-y-2">
        <p className="slate slate-accent">Index</p>
        <h1 className="font-display text-page font-semibold sm:text-3xl">Subjects</h1>
        <p className="max-w-2xl text-meta leading-relaxed text-ink-muted">
          The archive is catalogued by subject area. Pick one to see everything filed under it, then
          narrow further by topic, contributor or length.
        </p>
      </header>

      <div className="mb-6 border-b border-line pb-4">
        <ResultCount total={categories.length} singular="subject" zeroLabel="No subjects yet" />
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="No subjects yet"
          description="Subjects appear here once an administrator adds them."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              description={CATEGORY_DESCRIPTIONS[category.slug]}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
