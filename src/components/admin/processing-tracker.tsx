"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { cn } from "@/lib/utils/cn";

type Status = {
  processingStatus: "NONE" | "UPLOADING" | "QUEUED" | "PROCESSING" | "READY" | "FAILED";
  ready: boolean;
  failed: boolean;
  workerSeen: boolean;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
};

const POLL_MS = 3000;
/** After this long with no worker touching the job, say so. */
const WORKER_WARNING_MS = 20_000;

/**
 * Follows a transcode after the file has been uploaded.
 *
 * Polls rather than streams: the whole exchange is a handful of fields every
 * three seconds for a minute or two, and a websocket for that would be more
 * moving parts than the problem deserves. Polling stops the moment the job
 * reaches a terminal state.
 *
 * The worker warning is the part that matters in practice. Video processing
 * needs `npm run worker` running in a second terminal, and without it a job
 * sits at QUEUED indefinitely — which is indistinguishable from "still
 * working" unless the screen says otherwise.
 */
export function ProcessingTracker({ contentId }: { contentId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let active = true;
    const startedAt = Date.now();

    async function poll() {
      try {
        const response = await fetch(`/api/admin/videos/${contentId}/status`);
        if (!response.ok) return;
        const body = (await response.json()) as { data?: Status };
        if (!active || !body.data) return;

        setStatus(body.data);
        setElapsed(Date.now() - startedAt);

        if (body.data.ready || body.data.failed) {
          window.clearInterval(timer);
        }
      } catch {
        // A dropped poll is not worth reporting; the next one will tell us.
      }
    }

    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [contentId]);

  if (!status) {
    return (
      <Row icon={<Loader2 className="size-4 animate-spin text-ink-muted" />} tone="neutral">
        Checking the queue…
      </Row>
    );
  }

  if (status.failed) {
    return (
      <div className="space-y-3 rounded-control border border-critical/40 bg-critical/10 p-4">
        <Row icon={<AlertTriangle className="size-4 text-critical" />} tone="critical">
          Processing failed after {status.attempts} of {status.maxAttempts} attempts.
        </Row>
        {status.lastError ? (
          <p className="rounded border border-critical/30 bg-black/20 p-2.5 font-mono text-2xs text-critical/90">
            {status.lastError}
          </p>
        ) : null}
        <p className="text-meta text-ink-muted">
          The most common cause is FFmpeg not being installed or not on PATH. Check with{" "}
          <code className="font-mono text-2xs text-ink">ffmpeg -version</code>.
        </p>
      </div>
    );
  }

  if (status.ready) {
    return (
      <div className="space-y-3 rounded-control border border-positive/40 bg-positive/10 p-4">
        <Row icon={<CheckCircle2 className="size-4 text-positive" />} tone="positive">
          Processing finished. The recording is ready to publish.
        </Row>
        <Button asChild size="sm">
          <Link href={routes.admin.content}>Publish it</Link>
        </Button>
      </div>
    );
  }

  const stalled = !status.workerSeen && elapsed > WORKER_WARNING_MS;

  return (
    <div className="space-y-3 rounded-control border border-line bg-raised p-4">
      <Row
        icon={
          status.processingStatus === "PROCESSING" ? (
            <Loader2 className="size-4 animate-spin text-accent" />
          ) : (
            <Clock className="size-4 text-ink-muted" />
          )
        }
        tone="neutral"
      >
        {status.processingStatus === "PROCESSING"
          ? "Transcoding now — this takes a few minutes for a long recording."
          : "Queued, waiting for a worker to pick it up."}
      </Row>

      {/* Indeterminate on purpose: FFmpeg progress is not reported back, so a
          percentage here would be invented. A moving bar says "working"
          without claiming to know how far along it is. */}
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full w-1/3 animate-[marquee_1.6s_linear_infinite] rounded-full bg-accent" />
      </div>

      {stalled ? (
        <div className="flex items-start gap-2 rounded border border-caution/40 bg-caution/10 p-2.5">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-caution" aria-hidden="true" />
          <p className="text-meta text-caution">
            No worker has picked this up yet. Video processing needs{" "}
            <code className="font-mono text-2xs">npm run worker</code> running in a second
            terminal — the upload is safe either way and will process once it starts.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Row({
  icon,
  tone,
  children,
}: {
  icon: React.ReactNode;
  tone: "neutral" | "positive" | "critical";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-meta",
        tone === "positive" && "text-positive",
        tone === "critical" && "text-critical",
        tone === "neutral" && "text-ink",
      )}
    >
      <span className="shrink-0">{icon}</span>
      {children}
    </p>
  );
}
