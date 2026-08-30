import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { requireStaff } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { queueStatistics, recentJobs } from "@/server/video/queue";
import { formatRelativeTime } from "@/lib/utils/format";
import { routes } from "@/config/routes";
import type { JobStatus } from "@prisma/client";

export const metadata = { robots: { index: false, follow: false } };

const TONES: Record<JobStatus, BadgeTone> = {
  QUEUED: "neutral",
  RUNNING: "accent",
  SUCCEEDED: "positive",
  FAILED: "critical",
  CANCELLED: "neutral",
};

/** Queue monitoring. Staff-only, and never exposed on a public route. */
export default async function AdminJobsPage() {
  await requireStaff();

  const [stats, jobs] = await Promise.all([
    safeQuery(() => queueStatistics(), {
      QUEUED: 0,
      RUNNING: 0,
      SUCCEEDED: 0,
      FAILED: 0,
      CANCELLED: 0,
    } as Record<JobStatus, number>),
    safeQuery(() => recentJobs(25), []),
  ]);

  return (
    <Container className="py-8">
      <header className="mb-6 space-y-1">
        <p className="slate slate-accent">Admin</p>
        <h1 className="font-display text-page font-semibold">Processing jobs</h1>
        <p className="text-meta text-ink-muted">
          Run <code className="rounded bg-sunken px-1 font-mono text-2xs">npm run worker</code> to
          process the queue.
        </p>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(Object.keys(stats) as JobStatus[]).map((status) => (
          <div key={status} className="rounded-card border border-line bg-surface p-4">
            <p className="slate">{status}</p>
            <p className="mt-1 font-mono text-2xl tabular-nums text-ink">{stats[status]}</p>
          </div>
        ))}
      </div>

      {jobs.length === 0 ? (
        <EmptyState title="No jobs yet" description="Jobs appear here once a video is uploaded." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-line bg-surface">
              <tr className="slate">
                <th scope="col" className="px-4 py-3">
                  Recording
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3">
                  Attempts
                </th>
                <th scope="col" className="px-4 py-3">
                  Created
                </th>
                <th scope="col" className="px-4 py-3">
                  Last error
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link
                      href={routes.admin.contentEdit(job.contentId)}
                      className="text-ink hover:text-accent"
                    >
                      {job.content?.title ?? job.contentId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={TONES[job.status as JobStatus]}>{job.status}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-2xs tabular-nums text-ink-muted">
                    {job.attempts} / {job.maxAttempts}
                  </td>
                  <td className="px-4 py-3 text-meta text-ink-muted">
                    {formatRelativeTime(job.createdAt)}
                  </td>
                  {/* Administrator-facing summary only — never raw FFmpeg output. */}
                  <td className="max-w-xs truncate px-4 py-3 text-meta text-critical">
                    {job.lastError ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
