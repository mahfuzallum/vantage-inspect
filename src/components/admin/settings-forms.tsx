"use client";

import { useActionState } from "react";
import {
  updateSeoSettingsAction,
  updateSiteSettingsAction,
  updateUnlockCodeAction,
  saveStorageProfileAction,
  testStorageProfileAction,
  activateStorageProfileAction,
  deleteStorageProfileAction,
} from "@/server/actions/admin-settings";
import { initialAdminState } from "@/server/actions/admin-form-state";
import { TextField } from "@/components/forms/text-field";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { Button } from "@/components/ui/button";
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


export function StorageSettingsForm({
  profiles,
  activeId,
}: {
  profiles: Array<{
    id: string; name: string; type: "local" | "s3"; endpoint: string | null; region: string;
    bucket: string | null; publicUrl: string | null; forcePathStyle: boolean; enabled: boolean;
  }>;
  activeId: string | null;
}) {
  const [saveState, saveAction] = useActionState(saveStorageProfileAction, initialAdminState);
  const [testState, testAction] = useActionState(testStorageProfileAction, initialAdminState);
  const [activateState, activateAction] = useActionState(activateStorageProfileAction, initialAdminState);
  const [deleteState, deleteAction] = useActionState(deleteStorageProfileAction, initialAdminState);

  return (
    <div className="mt-10 space-y-6">
      <FormMessage status={saveState.status} message={saveState.message} />
      <FormMessage status={testState.status} message={testState.message} />
      <FormMessage status={activateState.status} message={activateState.message} />
      <FormMessage status={deleteState.status} message={deleteState.message} />
      {profiles.length ? (
        <FormSection title="Configured storage" description="Keep multiple storage backends ready. Only the active backend receives new uploads.">
          <div className="space-y-3">
            {profiles.map((profile) => (
              <div key={profile.id} className="rounded-card border border-line bg-raised p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{profile.name}</p>
                      {activeId === profile.id ? <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent">Active</span> : null}
                      {!profile.enabled ? <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">Disabled</span> : null}
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">{profile.type === "s3" ? `${profile.bucket ?? "No bucket"} · ${profile.region}` : "Local disk"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeId !== profile.id && profile.enabled ? (
                      <form action={activateAction}><input type="hidden" name="id" value={profile.id} /><SubmitButton pendingLabel="Activating…">Set active</SubmitButton></form>
                    ) : null}
                    <form action={deleteAction} onSubmit={(event) => { if (!window.confirm(`Delete storage profile “${profile.name}”?`)) event.preventDefault(); }}>
                      <input type="hidden" name="id" value={profile.id} />
                      <button type="submit" className="h-10 rounded-control border border-critical/30 px-3 text-sm text-critical hover:bg-critical/10">Delete</button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </FormSection>
      ) : null}

      <FormSection title="Add or update storage" description="Credentials are encrypted before they are stored in the database. They are never sent to the browser.">
        <form action={saveAction} className="space-y-4">
          <TextField label="Storage name" name="name" required placeholder="My Cloudflare R2" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><label className="block text-sm font-medium text-ink" htmlFor="storage-type">Provider</label><select id="storage-type" name="type" defaultValue="s3" className="h-10 w-full rounded-control border border-line bg-raised px-3 text-sm text-ink"><option value="s3">S3-compatible (R2, S3, B2, Wasabi, MinIO)</option><option value="local">Local disk</option></select></div>
            <TextField label="Region" name="region" defaultValue="auto" />
          </div>
          <TextField label="Endpoint" name="endpoint" type="url" placeholder="https://xxxx.r2.cloudflarestorage.com" hint="For Cloudflare R2, use the S3 API endpoint." />
          <TextField label="Bucket" name="bucket" placeholder="webcamprime" />
          <div className="grid gap-4 sm:grid-cols-2"><TextField label="Access key" name="accessKey" type="password" autoComplete="off" /><TextField label="Secret key" name="secretKey" type="password" autoComplete="off" /></div>
          <TextField label="Public URL" name="publicUrl" type="url" placeholder="https://media.example.com" hint="Optional. Used for public HLS, thumbnails and previews." />
          <label className="flex items-center gap-2 text-sm text-ink-muted"><input type="checkbox" name="forcePathStyle" className="size-4 accent-[var(--color-accent)]" /> Force path-style requests</label>
          <label className="flex items-center gap-2 text-sm text-ink-muted"><input type="checkbox" name="makeActive" defaultChecked className="size-4 accent-[var(--color-accent)]" /> Make this the active storage for new uploads</label>
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingLabel="Saving…">Save storage</SubmitButton>
            <Button type="submit" formAction={testAction} variant="outline">Test connection</Button>
          </div>
        </form>
      </FormSection>
    </div>
  );
}
