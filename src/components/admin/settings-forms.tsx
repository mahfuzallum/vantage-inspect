"use client";

import { useActionState } from "react";
import {
  updateSeoSettingsAction,
  updateSiteSettingsAction,
  updateUnlockCodeAction,
} from "@/server/actions/admin-settings";
import { initialAdminState } from "@/server/actions/admin-form-state";
import { TextField } from "@/components/forms/text-field";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { FormSection } from "./admin-shell";
import { Textarea } from "@/components/ui/input";

export function SiteSettingsForm({
  values,
}: {
  values: {
    siteName: string;
    tagline: string;
    contactEmail: string;
    paginationSize: number;
    maintenanceMode: boolean;
    maintenanceMessage: string;
  };
}) {
  const [state, action] = useActionState(updateSiteSettingsAction, initialAdminState);

  return (
    <form action={action} className="space-y-6">
      <FormMessage status={state.status} message={state.message} />

      <FormSection title="Identity">
        <TextField
          label="Site name"
          name="siteName"
          required
          defaultValue={values.siteName}
          errors={state.fieldErrors?.siteName}
        />
        <TextField
          label="Tagline"
          name="tagline"
          defaultValue={values.tagline}
          errors={state.fieldErrors?.tagline}
        />
        <TextField
          label="Contact email"
          name="contactEmail"
          type="email"
          defaultValue={values.contactEmail}
          errors={state.fieldErrors?.contactEmail}
        />
      </FormSection>

      <FormSection title="Browsing">
        <TextField
          label="Results per page"
          name="paginationSize"
          type="number"
          min={12}
          max={60}
          defaultValue={values.paginationSize}
          errors={state.fieldErrors?.paginationSize}
        />
      </FormSection>

      <FormSection
        title="Maintenance"
        description="Architecture only for now — the flag is stored and readable, but no route enforces it yet."
      >
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            name="maintenanceMode"
            defaultChecked={values.maintenanceMode}
            className="size-4 accent-[var(--color-accent)]"
          />
          Maintenance mode
        </label>
        <div className="space-y-1.5">
          <label htmlFor="maintenanceMessage" className="block text-sm font-medium text-ink">
            Message
          </label>
          <Textarea
            id="maintenanceMessage"
            name="maintenanceMessage"
            rows={2}
            maxLength={300}
            defaultValue={values.maintenanceMessage}
          />
        </div>
      </FormSection>

      <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
    </form>
  );
}

export function SeoSettingsForm({
  values,
}: {
  values: {
    defaultTitle: string;
    defaultDescription: string;
    defaultOgImage: string;
    twitterHandle: string;
    robotsAllowIndexing: boolean;
  };
}) {
  const [state, action] = useActionState(updateSeoSettingsAction, initialAdminState);

  return (
    <form action={action} className="space-y-6">
      <FormMessage status={state.status} message={state.message} />

      <FormSection title="Defaults">
        <TextField
          label="Default title"
          name="defaultTitle"
          required
          maxLength={70}
          defaultValue={values.defaultTitle}
          errors={state.fieldErrors?.defaultTitle}
        />
        <div className="space-y-1.5">
          <label htmlFor="defaultDescription" className="block text-sm font-medium text-ink">
            Default description
          </label>
          <Textarea
            id="defaultDescription"
            name="defaultDescription"
            rows={3}
            maxLength={180}
            defaultValue={values.defaultDescription}
          />
          {state.fieldErrors?.defaultDescription ? (
            <p role="alert" className="text-sm text-critical">
              {state.fieldErrors.defaultDescription[0]}
            </p>
          ) : null}
        </div>
        <TextField
          label="Default social image URL"
          name="defaultOgImage"
          type="url"
          defaultValue={values.defaultOgImage}
          errors={state.fieldErrors?.defaultOgImage}
        />
        <TextField label="Social handle" name="twitterHandle" defaultValue={values.twitterHandle} />
      </FormSection>

      <FormSection
        title="Indexing"
        description="Applies to public pages. Account and admin routes stay noindex regardless."
      >
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            name="robotsAllowIndexing"
            defaultChecked={values.robotsAllowIndexing}
            className="size-4 accent-[var(--color-accent)]"
          />
          Allow search engines to index public pages
        </label>
      </FormSection>

      <SubmitButton pendingLabel="Saving…">Save SEO defaults</SubmitButton>
    </form>
  );
}

/**
 * Changes the wordmark unlock code.
 *
 * Kept apart from the other settings forms: it is a credential, and mixing a
 * credential into a form that also carries site name and tagline invites
 * saving it by accident while editing something unrelated.
 */
export function UnlockCodeForm({ isConfigured }: { isConfigured: boolean }) {
  const [state, action] = useActionState(updateUnlockCodeAction, initialAdminState);

  return (
    <form action={action} className="space-y-6">
      <FormMessage status={state.status} message={state.message} />

      <FormSection
        title="Unlock code"
        description="Five taps on the wordmark opens a prompt for this code and signs you straight in. Numbers, letters, anything — six characters or more."
      >
        {isConfigured ? (
          <TextField
            label="Current code"
            name="currentCode"
            type="password"
            required
            autoComplete="off"
            hint="Required, so a session left open cannot quietly change it."
            errors={state.fieldErrors?.currentCode}
          />
        ) : (
          <p className="rounded-control border border-caution/40 bg-caution/10 px-3 py-2.5 text-sm text-caution">
            No code is set yet. The value from ADMIN_UNLOCK_CODE is used until you set one here.
          </p>
        )}

        <TextField
          label="New code"
          name="newCode"
          type="password"
          required
          autoComplete="new-password"
          errors={state.fieldErrors?.newCode}
        />

        <TextField
          label="Confirm new code"
          name="confirmCode"
          type="password"
          required
          autoComplete="new-password"
          errors={state.fieldErrors?.confirmCode}
        />
      </FormSection>

      <SubmitButton pendingLabel="Saving…">Change unlock code</SubmitButton>
    </form>
  );
}
