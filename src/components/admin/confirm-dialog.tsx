"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, type ButtonVariant } from "@/components/ui/button";

export type ConfirmDialogProps = {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: ButtonVariant;

  /**
   * Kept for backwards compatibility with existing callers.
   *
   * The old typed-confirmation requirement has been removed.
   * Passing requireTyped no longer forces the user to type anything.
   */
  requireTyped?: string;

  /**
   * Pre-bound server action.
   * No identifier travels through the DOM.
   */
  action: () => Promise<unknown>;
};

/**
 * Simple confirmation dialog for admin actions.
 *
 * Destructive actions still require opening the confirmation modal,
 * but the administrator no longer needs to type the record name.
 *
 * This keeps the UI fast and avoids the unnecessary typing step while
 * server-side authorization remains responsible for the actual security.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "danger",
  action,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openDialog() {
    setError(null);
    setOpen(true);
  }

  function closeDialog() {
    if (isPending) return;

    setError(null);
    setOpen(false);
  }

  function handleConfirm() {
    if (isPending) return;

    setError(null);

    startTransition(async () => {
      try {
        await action();

        setOpen(false);
      } catch {
        setError("That didn't complete. Try again.");
      }
    });
  }

  return (
    <>
      <span
        onClick={openDialog}
        className="contents"
      >
        {trigger}
      </span>

      <Modal
        open={open}
        onClose={closeDialog}
        title={title}
        description={description}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeDialog}
              disabled={isPending}
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant={variant}
              size="sm"
              disabled={isPending}
              onClick={handleConfirm}
            >
              {isPending ? (
                <Loader2
                  className="size-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : null}

              {isPending
                ? "Processing..."
                : confirmLabel}
            </Button>
          </div>
        }
      >
        {error ? (
          <p
            role="alert"
            className="text-sm text-critical"
          >
            {error}
          </p>
        ) : null}
      </Modal>
    </>
  );
}