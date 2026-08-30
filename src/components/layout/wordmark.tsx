import { Star } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * The wordmark, at masthead size.
 *
 * Heavy white type against the dark page, with a single gold star as the mark
 * and one gold word in the strapline. The gold is spent in exactly those two
 * places: the eye picks up the pairing as deliberate, whereas colouring more
 * of the line would read as decoration and stop meaning anything.
 *
 * `text-white` explicitly rather than the inherited ink colour — the masthead
 * sits over a glow, and the name is the one element that must not soften into
 * its background.
 */
export function Wordmark({
  name,
  tagline,
  highlight,
  className,
}: {
  name: string;
  tagline?: string;
  /** The one word in the tagline to pick out in gold. Matched case-insensitively. */
  highlight?: string;
  className?: string;
}) {
  return (
    <div className={cn("select-none", className)}>
      <div className="flex items-center justify-center gap-2.5">
        <span className="font-display text-3xl font-extrabold uppercase tracking-[-0.02em] text-white sm:text-4xl">
          {name}
        </span>
        <Star
          className="size-6 shrink-0 fill-[var(--color-gold)] text-[var(--color-gold)] sm:size-7"
          aria-hidden="true"
        />
      </div>

      {tagline ? (
        <p className="mt-1.5 text-center text-sm font-semibold text-white/90">
          {highlightWord(tagline, highlight)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Splits the tagline around the highlighted word.
 *
 * Returns the line untouched when the word is absent, so a tagline edited in
 * the admin panel never breaks — it simply stops being highlighted.
 */
function highlightWord(tagline: string, highlight?: string) {
  if (!highlight) return tagline;

  const index = tagline.toLowerCase().indexOf(highlight.toLowerCase());
  if (index === -1) return tagline;

  return (
    <>
      {tagline.slice(0, index)}
      <span className="text-[var(--color-gold)]">
        {tagline.slice(index, index + highlight.length)}
      </span>
      {tagline.slice(index + highlight.length)}
    </>
  );
}
