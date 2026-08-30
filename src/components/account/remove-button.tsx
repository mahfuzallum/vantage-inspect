"use client";

import { useTransition } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type RemoveButtonProps = {
  /** Bound server action. The item id is never read from the client. */
  action: () => Promise<void>;
  label: string;
  variant?: "icon" | "text";
  className?: string;
};

/**
 * Small destructive control used by the saved and history lists. The action
 * arrives pre-bound to its id, so nothing identifying travels through props
 * that a reader could tamper with.
 */
export function RemoveButton({ action, label, variant = "icon", className }: RemoveButtonProps) {
  const [isPending, startTransition] = useTransition();

  if (variant === "text") {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => action())}
        className={cn(
          "inline-flex items-center gap-1.5 text-meta text-ink-muted transition-colors",
          "hover:text-critical disabled:opacity-50",
          className,
        )}
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="size-3.5" aria-hidden="true" />
        )}
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      disabled={isPending}
      onClick={() => startTransition(() => action())}
      className={cn(
        "rounded-control border border-line bg-surface/90 p-1.5 text-ink-muted backdrop-blur-sm",
        "transition-colors hover:border-critical/50 hover:text-critical disabled:opacity-50",
        className,
      )}
    >
      {isPending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <X className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
