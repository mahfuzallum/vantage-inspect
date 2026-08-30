import Link from "next/link";
import { Container } from "./container";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export type RouteStubProps = {
  eyebrow: string;
  title: string;
  /** What this route will do once its Step 2 implementation lands. */
  summary: string;
  /** The pieces already in place that this screen will assemble. */
  ready?: string[];
  action?: { label: string; href: string };
  className?: string;
};

/**
 * Placeholder for a route whose architecture exists but whose UI is Step 2
 * work. Renders the real chrome so navigation, layouts, guards and metadata
 * can be exercised end to end today.
 */
export function RouteStub({
  eyebrow,
  title,
  summary,
  ready = [],
  action,
  className,
}: RouteStubProps) {
  return (
    <Container className={cn("py-12", className)}>
      <div className="leader-rule" aria-hidden="true" />
      <p className="slate slate-accent mt-4">{eyebrow}</p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">{summary}</p>

      {ready.length > 0 ? (
        <div className="mt-8 max-w-2xl rounded-card border border-line bg-surface p-5">
          <p className="slate mb-3">Foundations in place</p>
          <ul className="space-y-2 text-sm text-ink-muted">
            {ready.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {action ? (
        <Button asChild variant="outline" className="mt-6">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </Container>
  );
}
