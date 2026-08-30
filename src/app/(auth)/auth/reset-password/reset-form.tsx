"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/server/actions/auth";
import { initialAuthState } from "@/server/actions/auth-state";
import { PasswordField } from "@/components/forms/password-field";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialAuthState);

  if (state.status === "success") {
    return (
      <div className="space-y-5">
        <FormMessage status="success" message={state.message} />
        <Button asChild className="w-full" size="lg">
          <Link href={routes.auth.login}>Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <FormMessage status={state.status} message={state.formError} />

      {/* Carried in a hidden field rather than left in the address bar on submit. */}
      <input type="hidden" name="token" value={token} />

      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        required
        autoFocus
        showStrength
        hint="At least 10 characters, with upper and lower case and a number."
        errors={state.fieldErrors?.password}
      />

      <PasswordField
        label="Confirm new password"
        name="confirmPassword"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />

      <SubmitButton className="w-full" size="lg" pendingLabel="Saving…">
        Set new password
      </SubmitButton>
    </form>
  );
}
