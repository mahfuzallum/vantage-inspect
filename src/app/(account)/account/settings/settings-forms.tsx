"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  requestEmailChangeAction,
  updatePreferencesAction,
  updateProfileAction,
} from "@/server/actions/account";
import { initialAccountState } from "@/server/actions/account-state";
import { TextField } from "@/components/forms/text-field";
import { PasswordField } from "@/components/forms/password-field";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { Textarea } from "@/components/ui/input";

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-panel border border-line bg-surface p-5">
      <h2 id={id} className="font-display text-section font-semibold text-ink">
        {title}
      </h2>
      {description ? <p className="mt-1 text-meta text-ink-muted">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function ProfileForm({
  displayName,
  username,
  bio,
}: {
  displayName: string;
  username: string;
  bio: string | null;
}) {
  const [state, action] = useActionState(updateProfileAction, initialAccountState);

  return (
    <SettingsSection
      id="profile-settings"
      title="Profile"
      description="How you appear across the archive."
    >
      <form action={action} className="max-w-md space-y-5">
        <FormMessage status={state.status} message={state.formError ?? state.message} />

        <TextField
          label="Display name"
          name="displayName"
          autoComplete="name"
          required
          defaultValue={displayName}
          errors={state.fieldErrors?.displayName}
        />

        <TextField
          label="Username"
          name="username"
          autoComplete="username"
          required
          defaultValue={username}
          hint="Letters, numbers and underscores."
          errors={state.fieldErrors?.username}
        />

        <div className="space-y-1.5">
          <label htmlFor="bio" className="block text-sm font-medium text-ink">
            Bio
          </label>
          <Textarea
            id="bio"
            name="bio"
            rows={3}
            maxLength={500}
            defaultValue={bio ?? ""}
            placeholder="Optional. A sentence or two about your interests."
          />
        </div>

        <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
      </form>
    </SettingsSection>
  );
}

export function EmailForm({
  currentEmail,
  pending,
}: {
  currentEmail: string;
  pending: { newEmail: string; expiresAt: Date } | null;
}) {
  const [state, action] = useActionState(requestEmailChangeAction, initialAccountState);

  return (
    <SettingsSection
      id="email-settings"
      title="Email"
      description="Used for sign-in and password resets."
    >
      <div className="max-w-md space-y-5">
        <div className="rounded-control border border-line bg-raised px-3 py-2.5">
          <p className="slate">Current address</p>
          <p className="mt-1 text-sm text-ink">{currentEmail}</p>
        </div>

        {pending ? (
          <div className="rounded-control border border-caution/40 bg-caution/10 px-3 py-2.5 text-sm text-caution">
            Awaiting confirmation for <strong>{pending.newEmail}</strong>. Your address stays as it
            is until that link is used.
          </div>
        ) : null}

        <form action={action} className="space-y-5">
          <FormMessage status={state.status} message={state.formError ?? state.message} />

          <TextField
            label="New email address"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            errors={state.fieldErrors?.email}
          />

          {/*
            No hardcoded claim about delivery. The action reports what the
            transport actually did, so this cannot drift out of step with the
            configured provider.
          */}

          <SubmitButton variant="secondary" pendingLabel="Requesting…">
            Request change
          </SubmitButton>
        </form>
      </div>
    </SettingsSection>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialAccountState);

  return (
    <SettingsSection
      id="password-settings"
      title="Password"
      description="Changing this signs you out everywhere, including here."
    >
      <form action={action} className="max-w-md space-y-5">
        <FormMessage status={state.status} message={state.formError} />

        <PasswordField
          label="Current password"
          name="currentPassword"
          autoComplete="current-password"
          required
          errors={state.fieldErrors?.currentPassword}
        />

        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          required
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

        <SubmitButton pendingLabel="Updating…">Change password</SubmitButton>
      </form>
    </SettingsSection>
  );
}

export type PreferenceValues = {
  autoplay: boolean;
  keepHistory: boolean;
  emailNotifications: boolean;
  itemsPerPage: number;
};

export function PreferencesForm({ values }: { values: PreferenceValues }) {
  const [state, action] = useActionState(updatePreferencesAction, initialAccountState);

  const toggles = [
    {
      name: "autoplay",
      label: "Autoplay",
      hint: "Start playing as soon as a recording opens.",
      checked: values.autoplay,
    },
    {
      name: "keepHistory",
      label: "Keep viewing history",
      hint: "Turn this off and nothing new is recorded.",
      checked: values.keepHistory,
    },
    {
      name: "emailNotifications",
      label: "Email notifications",
      hint: "Occasional updates about the archive.",
      checked: values.emailNotifications,
    },
  ];

  return (
    <SettingsSection
      id="preference-settings"
      title="Preferences"
      description="How the archive behaves for you."
    >
      <form action={action} className="max-w-md space-y-5">
        <FormMessage status={state.status} message={state.formError ?? state.message} />

        <fieldset className="space-y-4">
          <legend className="sr-only">Preferences</legend>

          {toggles.map((toggle) => (
            <label key={toggle.name} className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name={toggle.name}
                defaultChecked={toggle.checked}
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{toggle.label}</span>
                <span className="block text-meta text-ink-muted">{toggle.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor="itemsPerPage" className="block text-sm font-medium text-ink">
            Results per page
          </label>
          <select
            id="itemsPerPage"
            name="itemsPerPage"
            defaultValue={String(values.itemsPerPage)}
            className="h-10 cursor-pointer rounded-control border border-line bg-raised px-3 pr-8 text-sm text-ink hover:border-line-strong focus:border-accent focus:outline-none"
          >
            {[12, 24, 36, 48, 60].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <SubmitButton pendingLabel="Saving…">Save preferences</SubmitButton>
      </form>
    </SettingsSection>
  );
}
