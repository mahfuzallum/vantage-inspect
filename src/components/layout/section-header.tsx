import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type SectionHeaderProps = {
  /** Applied to the <h2> so a section can point at it with aria-labelledby. */
  id?: string;
  /** Mono slate label above the heading — the interface's signature device. */
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
};

export function SectionHeader({
  id,
  eyebrow,
  title,
  description,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="leader-rule" aria-hidden="true" />
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div className="space-y-1.5">
          {eyebrow ? <p className="slate slate-accent">{eyebrow}</p> : null}
          <h2 id={id} className="font-display text-section font-semibold sm:text-2xl">
            {title}
          </h2>
          {description ? <p className="max-w-2xl text-meta text-ink-muted">{description}</p> : null}
        </div>

        {action ? (
          <Link
            href={action.href}
            className="group inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-accent"
          >
            {action.label}
            <ArrowRight
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
