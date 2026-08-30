import Link from "next/link";
import { Container } from "@/components/layout/container";
import { AdminPageHeader, StatCard } from "@/components/admin/admin-shell";
import { ViewsChart } from "@/components/admin/views-chart";
import { RangePicker } from "@/components/admin/range-picker";
import { AdminTable, type Column } from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { Thumbnail } from "@/components/ui/thumbnail";
import { requireStaff } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { getDashboardActivity, getDashboardMetrics } from "@/server/services/admin-service";
import {
  getFavoriteStatistics,
  getReportStatistics,
  getTopContent,
  getTopCreators,
  getUserStatistics,
  getViewComparison,
  getViewsOverTime,
  getViewTotals,
  type TopContentRow,
  type CreatorStatistics,
} from "@/server/services/analytics-service";
import { auditActionLabel, recentAudit } from "@/server/services/audit-service";
import { DEFAULT_RANGE, isRangeOption, rangeLabel, type RangeOption } from "@/config/analytics";
import { formatCount, formatDate, formatRelativeTime } from "@/lib/utils/format";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };

const EMPTY_METRICS = {
  totalContent: 0,
  publishedContent: 0,
  draftContent: 0,
  archivedContent: 0,
  featuredContent: 0,
  totalCreators: 0,
  totalCategories: 0,
  totalTags: 0,
  totalUsers: 0,
  activeUsers: 0,
  suspendedUsers: 0,
  openReports: 0,
  totalViews: 0,
  failedProcessing: 0,
};

/**
 * Analytics dashboard.
 *
 * Every figure is a real aggregate. Where a number cannot be derived from
 * stored rows it is omitted rather than estimated — growth shows "no baseline"
 * instead of a fabricated percentage when the previous window was empty.
 *
 * Each query is wrapped so one failing aggregate degrades that panel only; the
 * dashboard never fails whole because analytics is unavailable.
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const raw = await searchParams;
  const rangeParam = Array.isArray(raw.range) ? raw.range[0] : raw.range;
  const range: RangeOption = isRangeOption(rangeParam) ? rangeParam : DEFAULT_RANGE;

  const [
    metrics,
    activity,
    audit,
    viewTotals,
    comparison,
    daily,
    topContent,
    topCreators,
    userStats,
    reportStats,
    favoriteStats,
  ] = await Promise.all([
    safeQuery(() => getDashboardMetrics(), EMPTY_METRICS),
    safeQuery(() => getDashboardActivity(), {
      recentContent: [],
      recentUsers: [],
      recentReports: [],
      popularContent: [],
    }),
    safeQuery(() => recentAudit(12), []),
    safeQuery(() => getViewTotals(), { allTime: 0, today: 0, week: 0, month: 0 }),
    safeQuery(() => getViewComparison(range), { current: 0, previous: 0, changePercent: null }),
    safeQuery(() => getViewsOverTime(range), []),
    safeQuery(() => getTopContent(range, 10), [] as TopContentRow[]),
    safeQuery(() => getTopCreators(8), [] as CreatorStatistics[]),
    safeQuery(() => getUserStatistics(range), {
      total: 0,
      newInRange: 0,
      activeLast30Days: 0,
      suspended: 0,
    }),
    safeQuery(() => getReportStatistics(), {
      pending: 0,
      thisWeek: 0,
      thisMonth: 0,
      resolved: 0,
      dismissed: 0,
    }),
    safeQuery(() => getFavoriteStatistics(range), { total: 0, inRange: 0 }),
  ]);

  const topColumns: Array<Column<TopContentRow>> = [
    {
      key: "thumb",
      header: "",
      width: "4.5rem",
      cell: (row) => (
        <div className="relative aspect-video w-14 overflow-hidden rounded border border-line bg-sunken">
          <Thumbnail src={row.thumbnailUrl} alt="" seed={row.slug} sizes="3.5rem" />
        </div>
      ),
    },
    {
      key: "title",
      header: "Title",
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={routes.admin.contentEdit(row.id)}
            className="block truncate text-ink hover:text-accent"
          >
            {row.title}
          </Link>
          <span className="slate">{row.creatorName ?? "Unattributed"}</span>
        </div>
      ),
    },
    {
      key: "views",
      header: "Views",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink">{formatCount(row.views)}</span>
      ),
    },
    {
      key: "published",
      header: "Published",
      secondary: true,
      cell: (row) => (
        <span className="text-meta text-ink-muted">
          {row.publishedAt ? formatDate(row.publishedAt) : "—"}
        </span>
      ),
    },
  ];

  const creatorColumns: Array<Column<CreatorStatistics>> = [
    {
      key: "name",
      header: "Contributor",
      cell: (row) => (
        <Link
          href={routes.admin.creatorEdit(row.id)}
          className="block truncate text-ink hover:text-accent"
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: "content",
      header: "Recordings",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-muted">{row.contentCount}</span>
      ),
    },
    {
      key: "views",
      header: "Total views",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink">
          {formatCount(row.totalViews)}
        </span>
      ),
    },
    {
      key: "avg",
      header: "Average",
      align: "right",
      secondary: true,
      cell: (row) => (
        <span className="font-mono text-2xs tabular-nums text-ink-muted">
          {formatCount(row.averageViews)}
        </span>
      ),
    },
  ];

  return (
    <Container className="py-8">
      <AdminPageHeader
        title={`Welcome, ${staff.name ?? staff.username}`}
        description="Every figure below is read live from the database."
        actions={<RangePicker value={range} />}
      />

      {metrics.openReports > 0 || metrics.failedProcessing > 0 ? (
        <div className="mb-6 space-y-2">
          {metrics.openReports > 0 ? (
            <Link
              href={routes.admin.reports}
              className="block rounded-control border border-caution/40 bg-caution/10 px-3 py-2.5 text-sm text-caution hover:bg-caution/15"
            >
              {metrics.openReports} report{metrics.openReports === 1 ? "" : "s"} awaiting review
            </Link>
          ) : null}
          {metrics.failedProcessing > 0 ? (
            <Link
              href={routes.admin.jobs}
              className="block rounded-control border border-critical/40 bg-critical/10 px-3 py-2.5 text-sm text-critical hover:bg-critical/15"
            >
              {metrics.failedProcessing} recording{metrics.failedProcessing === 1 ? "" : "s"} failed
              processing
            </Link>
          ) : null}
        </div>
      ) : null}

      <section
        aria-labelledby="views-panel"
        className="mb-8 rounded-panel border border-line bg-surface p-5"
      >
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="views-panel" className="font-display text-section font-semibold">
            Views · {rangeLabel(range)}
          </h2>
          <p className="slate">
            {comparison.changePercent === null ? (
              // Honest about the gap rather than showing a meaningless +100%.
              <span className="text-ink-faint">No prior period to compare against</span>
            ) : (
              <span className={comparison.changePercent >= 0 ? "text-positive" : "text-critical"}>
                {comparison.changePercent >= 0 ? "+" : ""}
                {comparison.changePercent}% vs previous {rangeLabel(range).toLowerCase()}
              </span>
            )}
          </p>
        </div>
        <ViewsChart points={daily} />
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Views today" value={viewTotals.today} tone="accent" />
        <StatCard label="Views this week" value={viewTotals.week} />
        <StatCard label="Views this month" value={viewTotals.month} />
        <StatCard label="Views all time" value={formatCount(viewTotals.allTime)} />

        <StatCard
          label="Total content"
          value={metrics.totalContent}
          href={routes.admin.content}
          hint={`${metrics.publishedContent} published · ${metrics.draftContent} draft`}
        />
        <StatCard label="Contributors" value={metrics.totalCreators} href={routes.admin.creators} />
        <StatCard
          label="Users"
          value={userStats.total}
          href={routes.admin.users}
          hint={`${userStats.newInRange} new · ${userStats.activeLast30Days} signed in (30d)`}
        />
        <StatCard
          label="Saves"
          value={favoriteStats.total}
          hint={`${favoriteStats.inRange} in period`}
        />

        <StatCard
          label="Reports pending"
          value={reportStats.pending}
          href={routes.admin.reports}
          tone={reportStats.pending > 0 ? "critical" : "default"}
        />
        <StatCard label="Reports this week" value={reportStats.thisWeek} />
        <StatCard label="Reports this month" value={reportStats.thisMonth} />
        <StatCard
          label="Reports resolved"
          value={reportStats.resolved}
          hint={`${reportStats.dismissed} dismissed`}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="top-content">
          <h2 id="top-content" className="slate mb-3">
            Top content · {rangeLabel(range)}
          </h2>
          <AdminTable
            caption="Top content"
            columns={topColumns}
            rows={topContent}
            rowKey={(row) => row.id}
            empty={
              <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-meta text-ink-muted">
                No views recorded in this period.
              </p>
            }
          />
        </section>

        <section aria-labelledby="top-creators">
          <h2 id="top-creators" className="slate mb-3">
            Top contributors
          </h2>
          <AdminTable
            caption="Top contributors"
            columns={creatorColumns}
            rows={topCreators}
            rowKey={(row) => row.id}
            empty={
              <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-meta text-ink-muted">
                No published content yet.
              </p>
            }
          />
        </section>

        <section
          aria-labelledby="recent-content"
          className="rounded-panel border border-line bg-surface p-5"
        >
          <h2 id="recent-content" className="slate mb-4">
            Recently added
          </h2>
          {activity.recentContent.length === 0 ? (
            <p className="text-meta text-ink-muted">Nothing yet.</p>
          ) : (
            <ul className="space-y-3">
              {activity.recentContent.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={routes.admin.contentEdit(item.id)}
                      className="block truncate text-sm text-ink hover:text-accent"
                    >
                      {item.title}
                    </Link>
                    <span className="slate">
                      {item.creator?.name ?? "Unattributed"} · {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>
                  <Badge tone={item.status === "PUBLISHED" ? "positive" : "neutral"}>
                    {item.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="recent-users"
          className="rounded-panel border border-line bg-surface p-5"
        >
          <h2 id="recent-users" className="slate mb-4">
            New accounts
          </h2>
          {activity.recentUsers.length === 0 ? (
            <p className="text-meta text-ink-muted">Nothing yet.</p>
          ) : (
            <ul className="space-y-3">
              {activity.recentUsers.map((user) => (
                <li key={user.id} className="flex items-center justify-between gap-3">
                  <Link
                    href={routes.admin.userDetail(user.id)}
                    className="min-w-0 truncate text-sm text-ink hover:text-accent"
                  >
                    {user.displayName} <span className="text-ink-faint">@{user.username}</span>
                  </Link>
                  <span className="slate shrink-0">{formatDate(user.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section
        aria-labelledby="audit"
        className="mt-6 rounded-panel border border-line bg-surface p-5"
      >
        <h2 id="audit" className="slate mb-4">
          Recent admin activity
        </h2>
        {audit.length === 0 ? (
          <p className="text-meta text-ink-muted">
            Nothing recorded yet. Actions appear here as soon as anyone edits the archive.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {audit.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-4 py-2.5 text-meta">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-ink">
                    {entry.actor?.displayName ?? entry.actor?.username ?? "System"}
                  </span>{" "}
                  <span className="text-ink-muted">{auditActionLabel(entry.action)}</span>
                </span>
                <time
                  dateTime={entry.createdAt.toISOString()}
                  title={formatDate(entry.createdAt)}
                  className="slate shrink-0"
                >
                  {formatRelativeTime(entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
