"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { passwordStrength, STRENGTH_LABELS } from "@/lib/auth/password-strength";
import { cn } from "@/lib/utils/cn";

export type PasswordFieldProps = {
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  /** Show the strength meter. Only useful when choosing a new password. */
  showStrength?: boolean;
  hint?: string;
  errors?: string[];
  required?: boolean;
  autoFocus?: boolean;
};

const BAR_TONE = ["bg-critical", "bg-critical", "bg-caution", "bg-accent", "bg-positive"] as const;

/**
 * Password input with a visibility toggle and optional strength feedback.
 *
 * The toggle flips the input type rather than rendering the value anywhere
 * else, and the field is never given a value prop — the password lives only in
 * the DOM node until the form is submitted.
 */
export function PasswordField({
  name,
  label,
  autoComplete,
  showStrength = false,
  hint,
  errors,
  required,
  autoFocus,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const id = useId();
  const messageId = `${id}-message`;
  const strengthId = `${id}-strength`;

  const score = showStrength ? passwordStrength(value) : 0;
  const hasError = Boolean(errors?.length);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="ml-1 text-accent" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          aria-invalid={hasError}
          aria-describedby={
            cn(hasError || hint ? messageId : "", showStrength ? strengthId : "")
              .trim()
              .replace(/\s+/g, " ")
              .trim() || undefined
          }
          onChange={(event) => showStrength && setValue(event.target.value)}
          className={cn(
            "h-10 w-full rounded-control border bg-raised pl-3 pr-11 text-sm text-ink",
            "placeholder:text-ink-faint transition-colors",
            "hover:border-line-strong focus:border-accent focus:outline-none",
            hasError ? "border-critical" : "border-line",
          )}
        />

        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-faint transition-colors hover:text-ink"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {showStrength ? (
        <div id={strengthId}>
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  index < score ? BAR_TONE[score] : "bg-line",
                )}
              />
            ))}
          </div>
          <p className="slate mt-1" aria-live="polite">
            {value ? STRENGTH_LABELS[score] : "\u00a0"}
          </p>
        </div>
      ) : null}

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
