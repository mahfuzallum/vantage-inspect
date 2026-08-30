"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/server/actions/auth";
import { initialAuthState } from "@/server/actions/auth-state";
import { TextField } from "@/components/forms/text-field";
import { PasswordField } from "@/components/forms/password-field";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { routes } from "@/config/routes";

export function LoginForm({
  callbackUrl,
  passwordChanged,
}: {
  callbackUrl: string;
  passwordChanged: boolean;
}) {
  const [state, action] = useActionState(loginAction, initialAuthState);

  return (
    <form action={action} className="space-y-5">
      {passwordChanged ? (
        <FormMessage
          status="success"
          message="Your password was changed. Sign in with the new one."
        />
      ) : null}

      <FormMessage status={state.status} message={state.formError} />

      {/* Validated server-side against same-origin paths before any redirect. */}
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        autoFocus
        placeholder="you@example.com"
        errors={state.fieldErrors?.email}
      />

      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />

      <div className="flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            name="rememberDevice"
            defaultChecked
            className="size-4 accent-[var(--color-accent)]"
          />
          Remember this device
        </label>

        <Link
          href={routes.auth.forgotPassword}
          className="text-sm text-ink-muted transition-colors hover:text-accent"
        >
          Forgot password?
        </Link>
      </div>

      <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>

      <p className="text-center text-sm text-ink-muted">
        No account yet?{" "}
        <Link href={routes.auth.register} className="text-accent hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
