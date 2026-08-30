"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteMediaAction } from "@/server/actions/admin-media";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

/**
 * Deletes one asset after confirmation.
 *
 * The server refuses if anything still references it and says how many, which
 * is surfaced here rather than shown as a generic failure.
 */
export function MediaDeleteButton({ assetId, label }: { assetId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${label}`}
        className="inline-flex items-center gap-1.5 text-meta text-ink-muted transition-colors hover:text-critical"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        Delete
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this asset?"
        description="The stored file is removed and the record deleted. This cannot be undone."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteMediaAction(assetId);
                  setMessage(result.message);
                  if (result.ok) setOpen(false);
                })
              }
            >
              {isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              Delete
            </Button>
          </div>
        }
      >
        <p className="break-all font-mono text-2xs text-ink-muted">{label}</p>
        {message ? (
          <p role="alert" className="mt-3 text-sm text-critical">
            {message}
          </p>
        ) : null}
      </Modal>

      {message && !open ? (
        <p role="status" className="mt-1 text-2xs text-ink-muted">
          {message}
        </p>
      ) : null}
    </>
  );
}
