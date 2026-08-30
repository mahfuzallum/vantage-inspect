import type { ReactNode } from "react";
import { AlertTriangle, Inbox, SearchX, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type StateShellProps = {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Shared shell for every non-content state. Errors explain what happened and
 * what to do next; empty screens are an invitation to act. Neither is ever a
 * browser alert.
 */
function StateShell({ icon, title, description, action, className }: StateShellProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-dashed",
        "border-line px-6 py-16 text-center",
        className,
      )}
    >
      <span className="text-ink-faint" aria-hidden="true">
        {icon}
      </span>
      <p className="font-display text-section font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-sm text-meta text-ink-muted">{description}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState(props: Omit<StateShellProps, "icon"> & { icon?: ReactNode }) {
  const { icon, ...rest } = props;
  return <StateShell {...rest} icon={icon ?? <Inbox className="size-7" />} />;
}

/** Empty search results — distinct from "nothing published yet". */
export function EmptySearchState({
  query,
  action,
  className,
}: {
  query?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell
      icon={<SearchX className="size-7" />}
      title={query ? `No matches for “${query}”` : "Search the archive"}
      description={
        query
          ? "Nothing in the catalogue matches that. Try fewer words, a contributor name, or a subject."
          : "Search titles, contributors and topics. Quote a phrase to match it exactly."
      }
      action={action}
      className={className}
    />
  );
}

export function ErrorState({
  title = "This didn't load",
  description = "The archive is reachable but this section failed. Try again in a moment.",
  action,
  className,
}: Partial<Omit<StateShellProps, "icon">>) {
  return (
    <StateShell
      icon={<AlertTriangle className="size-7 text-caution" />}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}

/** Section-scoped failure: the rest of the page is fine, this rail is not. */
export function SectionErrorState({ label, className }: { label: string; className?: string }) {
  return (
    <StateShell
      icon={<WifiOff className="size-6 text-caution" />}
      title={`${label} didn't load`}
      description="This section will reappear on the next refresh."
      className={cn("py-10", className)}
    />
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center py-16">
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-line border-t-accent"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
