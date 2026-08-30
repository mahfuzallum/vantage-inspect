import { useId } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type FormFieldProps = {
  label: string;
  /** Rendered under the control; replaced by `error` when one is present. */
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean;
  }) => ReactNode;
};

/**
 * Wires a label, description and error message to a control with the right
 * ARIA relationships, so every form in the app is accessible by default.
 */
export function FormField({ label, hint, error, required, className, children }: FormFieldProps) {
  const id = useId();
  const messageId = error || hint ? `${id}-message` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="ml-1 text-accent" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {children({ id, "aria-describedby": messageId, "aria-invalid": Boolean(error) })}

      {error ? (
        <p id={messageId} role="alert" className="text-sm text-critical">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
