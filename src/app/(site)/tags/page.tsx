import { Container } from "@/components/layout/container";
import { TagBadge } from "@/components/content/tag-badge";
import { EmptyState } from "@/components/ui/states";
import { ResultCount } from "@/components/content/result-count";
import { getFilterFacets } from "@/server/services/discovery-service";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const revalidate = 600;

export const metadata = buildMetadata({
  title: "Topics",
  description: "Cross-cutting topics used across the archive.",
  path: routes.tags,
});

export default async function TagsPage() {
  const { tags } = await getFilterFacets();

  return (
    <Container className="py-8 sm:py-10">
      <header className="mb-8 space-y-2">
        <p className="slate slate-accent">Index</p>
        <h1 className="font-display text-page font-semibold sm:text-3xl">Topics</h1>
        <p className="max-w-2xl text-meta leading-relaxed text-ink-muted">
          Topics cut across subjects — use them to find related material filed in different places.
        </p>
      </header>

      <div className="mb-6 border-b border-line pb-4">
        <ResultCount total={tags.length} singular="topic" zeroLabel="No topics yet" />
      </div>

      {tags.length === 0 ? (
        <EmptyState title="No topics yet" description="Topics appear once recordings are tagged." />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag.id}>
              <TagBadge tag={tag} showCount />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
