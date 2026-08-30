import { AlertTriangle, CheckCircle2, Clock, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ProcessingStatus } from "@prisma/client";

/**
 * Processing state indicator.
 *
 * A state label, not a progress bar. FFmpeg's progress output is unreliable
 * across a multi-rendition job, and an invented percentage that stalls at 75%
 * is worse than showing no percentage at all.
 */
type ProcessingState = { label: string; tone: string; icon: typeof Clock; spin?: boolean };

const FALLBACK_STATE: ProcessingState = {
  label: "No media",
  tone: "text-ink-faint border-line",
  icon: Clock,
};

const STATES: Record<ProcessingStatus, ProcessingState> = {
  NONE: FALLBACK_STATE,
  UPLOADING: { label: "Uploading", tone: "text-caution border-caution/40", icon: Upload },
  QUEUED: { label: "Queued", tone: "text-ink-muted border-line-strong", icon: Clock },
  PROCESSING: {
    label: "Processing",
    tone: "text-accent border-accent/40",
    icon: Loader2,
    spin: true,
  },
  READY: { label: "Ready", tone: "text-positive border-positive/40", icon: CheckCircle2 },
  FAILED: { label: "Failed", tone: "text-critical border-critical/40", icon: AlertTriangle },
};

export function ProcessingStatusBadge({
  status,
  className,
}: {
  status: ProcessingStatus;
  className?: string;
}) {
  // Indexed lookup can miss if the enum gains a member the map has not been
  // updated for; falling back keeps the badge rendering instead of crashing
  // the admin table.
  const state = STATES[status] ?? FALLBACK_STATE;
  const Icon = state.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
        "font-mono text-2xs uppercase tracking-wider",
        state.tone,
        className,
      )}
    >
      <Icon className={cn("size-3", state.spin && "animate-spin")} aria-hidden="true" />
      {state.label}
    </span>
  );
}
