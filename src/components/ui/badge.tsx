import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone = "neutral" | "accent" | "positive" | "caution" | "critical";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-raised text-ink-muted border-line",
  accent: "bg-accent/12 text-accent border-accent/30",
  positive: "bg-positive/12 text-positive border-positive/30",
  caution: "bg-caution/12 text-caution border-caution/30",
  critical: "bg-critical/12 text-critical border-critical/30",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "font-mono text-2xs uppercase tracking-wider",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Duration shown as a timecode chip in the corner of a thumbnail. */
export function TimecodeBadge({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cn(
        "rounded bg-sunken/85 px-1.5 py-0.5 font-mono text-2xs tabular-nums",
        "text-ink backdrop-blur-sm",
        className,
      )}
    >
      {value}
    </span>
  );
}
