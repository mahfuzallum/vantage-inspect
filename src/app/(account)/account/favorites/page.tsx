import Link from "next/link";
import { ContentCard } from "@/components/content/content-card";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { ResultCount } from "@/components/content/result-count";
import { RemoveButton } from "@/components/account/remove-button";
import { requireUser } from "@/lib/auth/guards";
import { listFavorites } from "@/server/services/library-service";
import { removeFavoriteAction } from "@/server/actions/account";
import { normalizePage } from "@/config/pagination";
import { buildUrl } from "@/lib/utils/url";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Saved recordings",
  path: routes.account.favorites,
  noIndex: true,
});

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(routes.account.favorites);
  const params = await searchParams;
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;

  // Scoped to the session user's id — a ?userId= would be ignored entirely.
  const result = await listFavorites(user.id, normalizePage(raw));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-page font-semibold">Saved</h1>
        <p className="text-meta text-ink-muted">Recordings you&apos;ve kept for later.</p>
      </header>

      <div className="border-b border-line pb-4">
        <ResultCount total={result.total} zeroLabel="Nothing saved yet" />
      </div>

      {result.items.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description="Use Save on any recording and it will appear here, across every device you sign in on."
          action={
            <Button asChild variant="outline">
              <Link href={routes.latest}>Browse the archive</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((item) => (
            <li key={item.id} className="relative">
              <ContentCard content={item} />
              {/* Bound server action: the id is closed over, not passed through the DOM. */}
              <RemoveButton
                action={removeFavoriteAction.bind(null, item.id)}
                label={`Remove ${item.title} from saved`}
                className="absolute right-2 top-2 z-10"
              />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        className="mt-10"
        page={result.page}
        totalPages={result.totalPages}
        buildHref={(page) =>
          buildUrl(routes.account.favorites, { page: page > 1 ? page : undefined })
        }
      />
    </div>
  );
}
