import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/** Page header used by every admin screen: title, description, actions. */
export function AdminPageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumb?: { label: string; href: string };
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-1">
        {breadcrumb ? (
          <Link href={breadcrumb.href} className="slate hover:text-accent">
            ← {breadcrumb.label}
          </Link>
        ) : (
          <p className="slate slate-accent">Admin</p>
        )}
        <h1 className="font-display text-page font-semibold">{title}</h1>
        {description ? <p className="text-meta text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/** Groups related fields in a long admin form. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-panel border border-line bg-surface p-5", className)}>
      <h2 className="font-display text-section font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-1 text-meta text-ink-muted">{description}</p> : null}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

/** Compact metric tile for the dashboard. */
export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  tone?: "default" | "accent" | "critical";
}) {
  const body = (
    <>
      <p className="slate">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-2xl tabular-nums",
          tone === "accent" && "text-accent",
          tone === "critical" && "text-critical",
          tone === "default" && "text-ink",
        )}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {hint ? <p className="slate mt-1">{hint}</p> : null}
    </>
  );

  const className = cn(
    "rounded-card border border-line bg-surface p-4",
    href && "transition-colors hover:border-accent/50 hover:bg-raised",
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
