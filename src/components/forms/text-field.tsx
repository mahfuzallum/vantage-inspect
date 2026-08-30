"use client";

import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  errors?: string[];
};

/**
 * Labelled text input with the error wired to the control via
 * aria-describedby and aria-invalid, so screen readers announce the problem
 * with the field rather than as loose text on the page.
 */
export function TextField({ label, hint, errors, className, ...props }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const hasError = Boolean(errors?.length);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {props.required ? (
          <span className="ml-1 text-accent" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <input
        id={id}
        aria-invalid={hasError}
        aria-describedby={hasError || hint ? messageId : undefined}
        className={cn(
          "h-10 w-full rounded-control border bg-raised px-3 text-sm text-ink",
          "placeholder:text-ink-faint transition-colors",
          "hover:border-line-strong focus:border-accent focus:outline-none",
          hasError ? "border-critical" : "border-line",
          className,
        )}
        {...props}
      />

      {hasError ? (
        <p id={messageId} role="alert" className="text-sm text-critical">
          {errors![0]}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
