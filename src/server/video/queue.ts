import "server-only";

import { db } from "@/lib/db";
import type {
  JobStatus,
  Prisma,
} from "@prisma/client";

/**
 * Durable job queue backed by the processing_jobs table.
 *
 * Jobs are stored in the database so they survive:
 * - deploys
 * - crashes
 * - worker restarts
 * - scale-downs
 *
 * Multiple workers can safely share the queue because claiming uses
 * FOR UPDATE SKIP LOCKED.
 */

export type ClaimedJob = {
  id: string;
  contentId: string;
  attempts: number;
  maxAttempts: number;
};

/**
 * Backoff between retries:
 * 1 minute
 * 5 minutes
 * 15 minutes
 */
const RETRY_DELAYS_MS: number[] = [
  60_000,
  300_000,
  900_000,
];

/**
 * Adds a video-processing job unless one is already queued or running
 * for this recording.
 */
export async function enqueueVideoProcessing(
  contentId: string,
  payload?: Record<string, unknown>,
): Promise<string | null> {
  const existing =
    await db.processingJob.findFirst({
      where: {
        contentId,
        status: {
          in: [
            "QUEUED",
            "RUNNING",
          ],
        },
      },
      select: {
        id: true,
      },
    });

  if (existing) {
    return existing.id;
  }

  /**
   * Prisma JSON fields require Prisma.InputJsonValue.
   *
   * The public function accepts Record<string, unknown>, so the conversion
   * is performed at the database boundary.
   */
  const jsonPayload =
    payload === undefined
      ? undefined
      : (payload as Prisma.InputJsonValue);

  const job =
    await db.processingJob.create({
      data: {
        contentId,
        payload: jsonPayload,
      },
      select: {
        id: true,
      },
    });

  await db.content.update({
    where: {
      id: contentId,
    },
    data: {
      processingStatus: "QUEUED",
      processingError: null,
    },
  });

  return job.id;
}

/**
 * Atomically claims the next due job.
 *
 * FOR UPDATE SKIP LOCKED allows multiple workers to process the queue
 * concurrently without claiming the same job.
 */
export async function claimNextJob(
  workerId: string,
): Promise<ClaimedJob | null> {
  const rows =
    await db.$queryRaw<ClaimedJob[]>`
      UPDATE processing_jobs
      SET
        status = 'RUNNING',
        attempts = attempts + 1,
        locked_at = NOW(),
        locked_by = ${workerId},
        started_at = COALESCE(
          started_at,
          NOW()
        ),
        updated_at = NOW()
      WHERE id = (
        SELECT id
        FROM processing_jobs
        WHERE
          status = 'QUEUED'
          AND run_after <= NOW()
        ORDER BY
          run_after ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id,
        content_id AS "contentId",
        attempts,
        max_attempts AS "maxAttempts"
    `;

  return rows[0] ?? null;
}

/**
 * Marks a processing job as successfully completed.
 */
export async function markJobSucceeded(
  jobId: string,
): Promise<void> {
  await db.processingJob.update({
    where: {
      id: jobId,
    },
    data: {
      status: "SUCCEEDED",
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

/**
 * Records a failure and decides whether the job should be retried.
 *
 * Retryable errors are retried until maxAttempts is reached.
 * Permanent errors immediately mark the job as FAILED.
 */
export async function markJobFailed(
  jobId: string,
  error: string,
  retryable: boolean,
): Promise<{
  willRetry: boolean;
}> {
  const job =
    await db.processingJob.findUnique({
      where: {
        id: jobId,
      },
      select: {
        attempts: true,
        maxAttempts: true,
        contentId: true,
      },
    });

  if (!job) {
    return {
      willRetry: false,
    };
  }

  const willRetry =
    retryable &&
    job.attempts <
      job.maxAttempts;

  const safeError =
    error.slice(0, 1000);

  if (willRetry) {
    /**
     * Calculate the retry index.
     */
    const delayIndex =
      Math.min(
        Math.max(
          job.attempts - 1,
          0,
        ),
        RETRY_DELAYS_MS.length - 1,
      );

    /**
     * Explicitly validate the value returned from the array.
     *
     * This removes the TypeScript "possibly undefined" error even with
     * strict noUncheckedIndexedAccess settings.
     */
    const delayValue =
      RETRY_DELAYS_MS[delayIndex];

    if (
      delayValue === undefined
    ) {
      throw new Error(
        "Retry delay is not configured.",
      );
    }

    const nextRunAt =
      new Date(
        Date.now() +
          delayValue,
      );

    await db.processingJob.update({
      where: {
        id: jobId,
      },
      data: {
        status: "QUEUED",
        runAfter: nextRunAt,
        lockedAt: null,
        lockedBy: null,
        lastError: safeError,
      },
    });

    return {
      willRetry: true,
    };
  }

  await db.$transaction([
    db.processingJob.update({
      where: {
        id: jobId,
      },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: safeError,
      },
    }),

    db.content.update({
      where: {
        id: job.contentId,
      },
      data: {
        processingStatus: "FAILED",
        processingError: safeError,
        processingCompletedAt:
          new Date(),
      },
    }),
  ]);

  return {
    willRetry: false,
  };
}

/**
 * Releases jobs whose worker died while processing.
 *
 * This prevents a RUNNING job from becoming permanently stuck.
 */
export async function reclaimStalledJobs(
  staleMinutes = 90,
): Promise<number> {
  const cutoff =
    new Date(
      Date.now() -
        staleMinutes *
          60_000,
    );

  const result =
    await db.processingJob.updateMany({
      where: {
        status: "RUNNING",
        lockedAt: {
          lt: cutoff,
        },
      },
      data: {
        status: "QUEUED",
        lockedAt: null,
        lockedBy: null,
        lastError:
          "Worker stalled; requeued.",
      },
    });

  return result.count;
}

/**
 * Counts jobs grouped by their status.
 *
 * Used by the admin monitoring view.
 */
export async function queueStatistics(): Promise<
  Record<JobStatus, number>
> {
  const rows =
    await db.processingJob.groupBy({
      by: ["status"],
      _count: {
        status: true,
      },
    });

  const base: Record<
    string,
    number
  > = {
    QUEUED: 0,
    RUNNING: 0,
    SUCCEEDED: 0,
    FAILED: 0,
    CANCELLED: 0,
  };

  for (const row of rows) {
    base[row.status] =
      row._count.status;
  }

  return base as Record<
    JobStatus,
    number
  >;
}

/**
 * Returns the most recent processing jobs for the admin view.
 */
export async function recentJobs(
  limit = 25,
) {
  return db.processingJob.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
    include: {
      content: {
        select: {
          id: true,
          slug: true,
          title: true,
        },
      },
    },
  });
}