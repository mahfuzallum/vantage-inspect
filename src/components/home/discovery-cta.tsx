import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";

/**
 * Closing band. Deliberately quiet — a signpost for readers who reached the
 * bottom without finding what they came for, not a sales pitch.
 */
export function DiscoveryCta() {
  return (
    <section aria-labelledby="cta-heading" className="border-y border-line bg-surface/40">
      <Container className="flex flex-col items-start gap-5 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-lg space-y-2">
          <div className="leader-rule w-24" aria-hidden="true" />
          <h2 id="cta-heading" className="pt-2 font-display text-section font-semibold">
            Didn&apos;t find it on this page?
          </h2>
          <p className="text-meta text-ink-muted">
            The full catalogue goes back further than the sections above. Search it directly, or
            browse by subject.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={routes.search()}>Search the archive</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={routes.categories}>Browse subjects</Link>
          </Button>
        </div>
      </Container>
    </section>
  );
}
