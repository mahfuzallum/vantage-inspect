"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteContentAction } from "@/server/actions/admin-content";

type DeleteContentButtonProps = {
  contentId: string;
  title: string;
};

export function DeleteContentButton({
  contentId,
  title,
}: DeleteContentButtonProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    const confirmed = window.confirm(
      `Delete “${title}”? This permanently removes the content and its stored media.`,
    );

    if (!confirmed) return;

    setError(null);

    startTransition(async () => {
      try {
        await deleteContentAction(contentId);
      } catch (err) {
        console.error(err);
        setError("Delete failed. Please try again.");
      }
    });
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="inline-flex items-center gap-1 text-meta text-critical transition-colors hover:text-critical/80 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Delete ${title}`}
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="size-3" aria-hidden="true" />
        )}

        {pending ? "Deleting…" : "Delete"}
      </button>

      {error ? (
        <span className="text-xs text-critical" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}