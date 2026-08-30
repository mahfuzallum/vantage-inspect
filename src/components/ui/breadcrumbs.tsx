import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type Crumb = { label: string; href: string };

export function Breadcrumbs({ trail, className }: { trail: Crumb[]; className?: string }) {
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-1.5 font-mono text-2xs uppercase tracking-wider">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
              {isLast ? (
                <span aria-current="page" className="truncate text-ink-muted">
                  {crumb.label}
                </span>
              ) : (
                <>
                  <Link href={crumb.href} className="truncate text-ink-faint hover:text-accent">
                    {crumb.label}
                  </Link>
                  <ChevronRight className="size-3 shrink-0 text-ink-faint" aria-hidden="true" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
