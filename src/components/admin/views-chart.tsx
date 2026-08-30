import { formatCount } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { DailyPoint } from "@/server/services/analytics-service";

export type ViewsChartProps = {
  points: DailyPoint[];
  className?: string;
};

/**
 * Views per day, drawn as inline SVG.
 *
 * No chart library: this is one series of bars, and pulling in a charting
 * dependency for it would cost far more bundle than the markup below. It also
 * stays a Server Component this way, so the chart ships zero JavaScript.
 *
 * Responsive via `viewBox` + `preserveAspectRatio` — the SVG scales to its
 * container rather than needing a resize observer.
 */
export function ViewsChart({ points, className }: ViewsChartProps) {
  if (points.length === 0) {
    return (
      <p className={cn("text-meta text-ink-muted", className)}>
        No view activity recorded in this period.
      </p>
    );
  }

  const width = 720;
  const height = 180;
  const paddingLeft = 8;
  const paddingBottom = 22;

  const max = Math.max(...points.map((point) => point.views), 1);
  const total = points.reduce((sum, point) => sum + point.views, 0);
  const plotWidth = width - paddingLeft * 2;
  const plotHeight = height - paddingBottom;

  const slot = plotWidth / points.length;
  // Keep a visible gap between bars, but never let one vanish entirely.
  const barWidth = Math.max(1, Math.min(slot - 2, 28));

  // Label roughly six dates regardless of range length.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  const formatLabel = (iso: string) => {
    const date = new Date(`${iso}T00:00:00Z`);
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  };

  const peak = points.reduce(
    (best, point) => (point.views > best.views ? point : best),
    points[0]!,
  );

  return (
    <figure className={cn("space-y-3", className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="slate">
          <span className="tabular-nums text-ink">{formatCount(total)}</span> views over{" "}
          {points.length} day{points.length === 1 ? "" : "s"}
        </span>
        <span className="slate">
          Peak {formatLabel(peak.date)}:{" "}
          <span className="tabular-nums">{formatCount(peak.views)}</span>
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Views per day. ${formatCount(total)} views in total across ${points.length} days, peaking at ${peak.views} on ${formatLabel(peak.date)}.`}
        className="h-44 w-full"
      >
        {/* Baseline */}
        <line
          x1={paddingLeft}
          y1={plotHeight}
          x2={width - paddingLeft}
          y2={plotHeight}
          stroke="var(--color-line)"
          strokeWidth="1"
        />

        {points.map((point, index) => {
          const barHeight =
            point.views === 0 ? 0 : Math.max(2, (point.views / max) * (plotHeight - 8));
          const x = paddingLeft + index * slot + (slot - barWidth) / 2;
          const y = plotHeight - barHeight;

          return (
            <rect
              key={point.date}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="1"
              fill={point.date === peak.date ? "var(--color-accent)" : "var(--color-line-strong)"}
            >
              {/* Native tooltip: no JavaScript needed for per-day detail. */}
              <title>{`${formatLabel(point.date)}: ${point.views} view${point.views === 1 ? "" : "s"}`}</title>
            </rect>
          );
        })}

        {points.map((point, index) =>
          index % labelEvery === 0 ? (
            <text
              key={`label-${point.date}`}
              x={paddingLeft + index * slot + slot / 2}
              y={height - 6}
              textAnchor="middle"
              fill="var(--color-ink-faint)"
              className="font-mono"
              fontSize="10"
            >
              {formatLabel(point.date)}
            </text>
          ) : null,
        )}
      </svg>

      {/* The same series as a table, for anyone the chart does not serve. */}
      <details className="text-meta text-ink-muted">
        <summary className="cursor-pointer hover:text-accent">View the data as a table</summary>
        <div className="mt-2 max-h-48 overflow-y-auto rounded-card border border-line">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface">
              <tr className="slate">
                <th scope="col" className="px-3 py-2">
                  Date
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Views
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {points.map((point) => (
                <tr key={`row-${point.date}`}>
                  <td className="px-3 py-1.5">{formatLabel(point.date)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-2xs tabular-nums">
                    {point.views}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
