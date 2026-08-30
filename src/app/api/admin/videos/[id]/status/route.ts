import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/auth/guards";
import { handleRouteError, ok } from "@/lib/api/response";
import { ApiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Processing state for one recording.
 *
 * Polled by the upload screen after a file lands. Deliberately small — it runs
 * every few seconds while a transcode is in flight, so it reads two rows and
 * returns a handful of fields rather than the whole record.
 *
 * `workerSeen` is the honest part: a queued job with no worker running will sit
 * at QUEUED forever, and the screen needs to be able to say so instead of
 * spinning indefinitely.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiRole("ADMIN", "MODERATOR");
    const { id } = await params;

    const content = await db.content.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        processingStatus: true,
        durationSeconds: true,
        hlsMasterKey: true,
      },
    });
    if (!content) throw new ApiError("NOT_FOUND", "That recording no longer exists.");

    const job = await db.processingJob.findFirst({
      where: { contentId: id },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        attempts: true,
        maxAttempts: true,
        lastError: true,
        lockedAt: true,
        startedAt: true,
        finishedAt: true,
      },
    });

    return ok({
      processingStatus: content.processingStatus,
      contentStatus: content.status,
      durationSeconds: content.durationSeconds,
      ready: content.processingStatus === "READY",
      failed: content.processingStatus === "FAILED" || job?.status === "FAILED",
      // A lock means a worker has actually picked the job up. Without one, a
      // QUEUED job is waiting for a worker that may not be running at all.
      workerSeen: Boolean(job?.lockedAt ?? job?.startedAt),
      attempts: job?.attempts ?? 0,
      maxAttempts: job?.maxAttempts ?? 0,
      // Surfaced so a failure can be acted on rather than merely observed.
      lastError: job?.lastError ?? null,
      startedAt: job?.startedAt ?? null,
      finishedAt: job?.finishedAt ?? null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
