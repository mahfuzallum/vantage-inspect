"use client";

import { useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { setContentStatusAction } from "@/server/actions/admin-content";
import { cn } from "@/lib/utils/cn";

export type ContentStatusValue = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

/**
 * Publish/unpublish without leaving the list.
 *
 * A button rather than a nested form: the row already sits inside the bulk
 * actions form, and a form inside a form is invalid markup that browsers
 * silently discard. The server action is called directly instead.
 *
 * Archived and scheduled records are deliberately not toggleable here — those
 * transitions carry consequences the list cannot explain, so they stay on the
 * edit screen where the context is.
 */
export function ContentStatusToggle({
  contentId,
  status,
}: {
  contentId: string;
  status: ContentStatusValue;
}) {
  const [pending, startTransition] = useTransition();

  if (status !== "DRAFT" && status !== "PUBLISHED") return null;

  const published = status === "PUBLISHED";
  const next = published ? "DRAFT" : "PUBLISHED";
  const label = published ? "Move to draft" : "Publish";

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={label}
      title={label}
      onClick={() =>
        startTransition(async () => {
          await setContentStatusAction(contentId, next);
        })
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-control border px-2 py-1",
        "text-2xs transition-colors disabled:opacity-50",
        published
          ? "border-positive/40 bg-positive/10 text-positive hover:bg-positive/20"
          : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      ) : published ? (
        <Eye className="size-3" aria-hidden="true" />
      ) : (
        <EyeOff className="size-3" aria-hidden="true" />
      )}
      {published ? "Live" : "Draft"}
    </button>
  );
}
