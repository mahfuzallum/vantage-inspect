import { pluralize } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export type ResultCountProps = {
  total: number;
  /** Noun to count. Defaults to the archive's unit of browsing. */
  singular?: string;
  plural?: string;
  /** Shown when the count is zero, instead of "0 recordings". */
  zeroLabel?: string;
  className?: string;
};

/** Server-rendered so a result count never costs client JavaScript. */
export function ResultCount({
  total,
  singular = "recording",
  plural,
  zeroLabel = "No matches",
  className,
}: ResultCountProps) {
  return (
    <p className={cn("slate", className)} aria-live="polite">
      {total === 0 ? (
        zeroLabel
      ) : (
        <>
          <span className="tabular-nums text-ink">{total.toLocaleString()}</span>{" "}
          {pluralize(total, singular, plural).replace(/^[\d,]+\s/, "")}
        </>
      )}
    </p>
  );
}
