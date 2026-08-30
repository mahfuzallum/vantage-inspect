"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { deleteAccountAction } from "@/server/actions/account";
import { initialAccountState } from "@/server/actions/account-state";
import { PasswordField } from "@/components/forms/password-field";
import { TextField } from "@/components/forms/text-field";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";

/**
 * Deliberately awkward. Three separate gates stand between a stray click and
 * an irreversible delete: an acknowledgement checkbox, the exact word DELETE,
 * and the account password re-entered. The server re-checks all three.
 */
export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action] = useActionState(deleteAccountAction, initialAccountState);
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <form action={action} className="max-w-md space-y-5">
      <FormMessage status={state.status} message={state.formError} />

      <div className="rounded-control border border-critical/40 bg-critical/10 px-4 py-3">
        <p className="text-sm font-medium text-critical">This cannot be undone.</p>
        <ul className="mt-2 space-y-1 text-meta text-ink-muted">
          <li>Your profile and sign-in details are removed.</li>
          <li>Saved recordings and viewing history are deleted.</li>
          <li>
            Reports you filed are kept, with your name detached, so moderation records stay intact.
          </li>
        </ul>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-0.5 size-4 accent-[var(--color-accent)]"
        />
        <span className="text-sm text-ink-muted">
          I understand that <strong className="text-ink">{email}</strong> and everything on it will
          be permanently deleted.
        </span>
      </label>

      <TextField
        label="Type DELETE to confirm"
        name="confirmation"
        autoComplete="off"
        required
        placeholder="DELETE"
        errors={state.fieldErrors?.confirmation}
      />

      <PasswordField
        label="Your password"
        name="password"
        autoComplete="current-password"
        required
        hint="Re-entered so a borrowed session cannot delete your account."
        errors={state.fieldErrors?.password}
      />

      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="danger" disabled={!acknowledged} pendingLabel="Deleting…">
          Delete my account
        </SubmitButton>
        <Button asChild variant="ghost">
          <Link href={routes.account.settings}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
