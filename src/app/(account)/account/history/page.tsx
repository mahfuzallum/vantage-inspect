import Link from "next/link";
import { Thumbnail } from "@/components/ui/thumbnail";
import { TimecodeBadge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { ResultCount } from "@/components/content/result-count";
import { RemoveButton } from "@/components/account/remove-button";
import { requireUser } from "@/lib/auth/guards";
import { getViewingHistory } from "@/server/services/library-service";
import { clearHistoryAction, removeHistoryItemAction } from "@/server/actions/account";
import { formatDuration, formatRelativeTime } from "@/lib/utils/format";
import { normalizePage } from "@/config/pagination";
import { buildUrl } from "@/lib/utils/url";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Viewing history",
  path: routes.account.history,
  noIndex: true,
});

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(routes.account.history);
  const params = await searchParams;
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;

  // Always paginated — history is never loaded in full.
  const result = await getViewingHistory(user.id, normalizePage(raw));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-page font-semibold">History</h1>
        <p className="text-meta text-ink-muted">
          What you&apos;ve opened recently. Turn this off any time in settings.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <ResultCount total={result.total} zeroLabel="No history yet" />
        {result.total > 0 ? (
          <form action={clearHistoryAction}>
            <Button type="submit" variant="danger" size="sm">
              Clear all history
            </Button>
          </form>
        ) : null}
      </div>

      {result.items.length === 0 ? (
        <EmptyState
          title="No history yet"
          description="Recordings you play appear here so you can pick up where you left off."
          action={
            <Button asChild variant="outline">
              <Link href={routes.latest}>Browse the archive</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {result.items.map((entry) => {
            const { content } = entry;
            const percent =
              content.durationSeconds && entry.progressSeconds > 0
                ? Math.min(100, (entry.progressSeconds / content.durationSeconds) * 100)
                : 0;

            return (
              <li key={content.id} className="group relative flex gap-3 py-4">
                <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-card border border-line bg-sunken sm:w-40">
                  <Thumbnail src={content.thumbnailUrl} alt="" seed={content.slug} sizes="10rem" />
                  {content.durationSeconds ? (
                    <TimecodeBadge
                      value={formatDuration(content.durationSeconds)}
                      className="absolute bottom-1.5 right-1.5"
                    />
                  ) : null}

                  {/* Resume marker: only drawn when a real position is stored. */}
                  {percent > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-1 bg-line-strong"
                    >
                      <span className="block h-full bg-accent" style={{ width: `${percent}%` }} />
                    </span>
                  ) : null}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="clamp-2 font-display text-card font-semibold text-ink">
                    <Link href={routes.content(content.slug)} className="hover:text-accent-strong">
                      {content.title}
                    </Link>
                  </h2>

                  {content.creator ? (
                    <p className="truncate text-meta text-ink-muted">{content.creator.name}</p>
                  ) : null}

                  <p className="slate">
                    <time dateTime={entry.lastViewedAt.toISOString()}>
                      Viewed {formatRelativeTime(entry.lastViewedAt)}
                    </time>
                    {entry.completed ? " · Finished" : null}
                    {!entry.completed && entry.progressSeconds > 0
                      ? ` · ${formatDuration(entry.progressSeconds)} in`
                      : null}
                  </p>
                </div>

                <RemoveButton
                  action={removeHistoryItemAction.bind(null, content.id)}
                  label={`Remove ${content.title} from history`}
                  className="self-start"
                />
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        className="mt-10"
        page={result.page}
        totalPages={result.totalPages}
        buildHref={(page) =>
          buildUrl(routes.account.history, { page: page > 1 ? page : undefined })
        }
      />
    </div>
  );
}
