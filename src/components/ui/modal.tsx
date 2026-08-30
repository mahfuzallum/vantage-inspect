"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * Built on <dialog>, so focus trapping, Escape handling and inertness come
 * from the platform rather than a hand-rolled implementation.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      className={cn(
        "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-panel border border-line",
        "bg-surface p-0 text-ink shadow-overlay backdrop:bg-sunken/70 backdrop:backdrop-blur-sm",
        className,
      )}
      onClick={(event) => {
        // Clicking the backdrop (the dialog element itself) closes.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="space-y-1">
          <h2 id="modal-title" className="font-display text-lg font-semibold">
            {title}
          </h2>
          {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-control p-1 text-ink-muted hover:bg-raised hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="px-5 py-4">{children}</div>
      {footer ? <div className="border-t border-line px-5 py-3">{footer}</div> : null}
    </dialog>
  );
}
