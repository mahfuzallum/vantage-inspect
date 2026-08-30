"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "@/server/actions/auth";
import { initialAuthState } from "@/server/actions/auth-state";
import { TextField } from "@/components/forms/text-field";
import { PasswordField } from "@/components/forms/password-field";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { routes } from "@/config/routes";

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, initialAuthState);

  return (
    <form action={action} className="space-y-5">
      <FormMessage status={state.status} message={state.formError} />

      <TextField
        label="Display name"
        name="displayName"
        autoComplete="name"
        required
        autoFocus
        placeholder="How you'll be shown"
        errors={state.fieldErrors?.displayName}
      />

      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        required
        placeholder="letters, numbers, underscores"
        hint="Used in your profile address."
        errors={state.fieldErrors?.username}
      />

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        errors={state.fieldErrors?.email}
      />

      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        required
        showStrength
        hint="At least 10 characters, with upper and lower case and a number."
        errors={state.fieldErrors?.password}
      />

      <PasswordField
        label="Confirm password"
        name="confirmPassword"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />

      <div className="space-y-1.5">
        <label className="flex cursor-pointer items-start gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            name="acceptTerms"
            className="mt-0.5 size-4 accent-[var(--color-accent)]"
          />
          <span>
            I accept the{" "}
            <Link href={routes.legal.terms} className="text-accent hover:underline">
              terms
            </Link>{" "}
            and{" "}
            <Link href={routes.legal.privacy} className="text-accent hover:underline">
              privacy notice
            </Link>
            .
          </span>
        </label>
        {state.fieldErrors?.acceptTerms ? (
          <p role="alert" className="text-sm text-critical">
            {state.fieldErrors.acceptTerms[0]}
          </p>
        ) : null}
      </div>

      <SubmitButton className="w-full" size="lg" pendingLabel="Creating account…">
        Create account
      </SubmitButton>

      <p className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href={routes.auth.login} className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
