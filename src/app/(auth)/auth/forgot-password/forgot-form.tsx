"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/server/actions/auth";
import { initialAuthState } from "@/server/actions/auth-state";
import { TextField } from "@/components/forms/text-field";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { routes } from "@/config/routes";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialAuthState);

  // The success message is deliberately identical whether or not the address
  // has an account, so the form is not an account-enumeration oracle.
  if (state.status === "success") {
    return (
      <div className="space-y-5">
        <FormMessage status="success" message={state.message} />
        <p className="text-meta text-ink-muted">
          Didn&apos;t get it? Check the address you entered, then try again in a few minutes.
        </p>
        <Link href={routes.auth.login} className="text-sm text-accent hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <FormMessage status={state.status} message={state.formError} />

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

      <SubmitButton className="w-full" size="lg" pendingLabel="Sending…">
        Send reset link
      </SubmitButton>

      <p className="text-center text-sm text-ink-muted">
        Remembered it?{" "}
        <Link href={routes.auth.login} className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
