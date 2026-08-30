"use client";

import { useFormStatus } from "react-dom";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/** Form-level message. Errors are assertive; confirmations are polite. */
export function FormMessage({
  status,
  message,
}: {
  status: "idle" | "error" | "success";
  message?: string;
}) {
  if (!message || status === "idle") return null;
  const isError = status === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-2 rounded-control border px-3 py-2.5 text-sm",
        isError
          ? "border-critical/40 bg-critical/10 text-critical"
          : "border-positive/40 bg-positive/10 text-positive",
      )}
    >
      {isError ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <span>{message}</span>
    </div>
  );
}

/**
 * Submit button that reads pending state from the enclosing form, so no
 * caller has to thread an isPending flag down by hand.
 */
export function SubmitButton({
  children,
  pendingLabel = "Working…",
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}
