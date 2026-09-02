"use client";

import { useActionState, useState } from "react";
import { updateMonetizationSettingsAction } from "@/server/actions/admin-settings";
import { initialAdminState } from "@/server/actions/admin-form-state";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { FormSection } from "./admin-shell";
import { TextField } from "@/components/forms/text-field";
import { Textarea } from "@/components/ui/input";

function CodeEditor({ name, label, defaultValue, hint, error }: { name: string; label: string; defaultValue: string; hint: string; error?: string[] }) {
  const [value, setValue] = useState(defaultValue);
  const [preview, setPreview] = useState(false);
  return <div className="space-y-2">
    <label htmlFor={name} className="block text-sm font-medium text-ink">{label}</label>
    <Textarea id={name} name={name} rows={7} value={value} onChange={e => setValue(e.target.value)} placeholder="Paste the ad network code here…" />
    <p className="text-xs leading-relaxed text-ink-muted">{hint}</p>
    {error?.[0] ? <p role="alert" className="text-sm text-critical">{error[0]}</p> : null}
    <button type="button" onClick={() => setPreview(v => !v)} className="rounded-control border border-line px-3 py-2 text-xs font-medium text-ink transition hover:border-accent/50 hover:bg-raised">{preview ? "Hide test preview" : "Test code"}</button>
    {preview ? <div className="mt-2 overflow-hidden rounded-card border border-line bg-white">
      <iframe title={`${label} test preview`} srcDoc={`<!doctype html><html><body style="margin:0;padding:12px;font-family:system-ui;background:white;color:#111">${value}</body></html>`} sandbox="allow-scripts allow-forms" className="min-h-40 w-full border-0" />
    </div> : null}
  </div>;
}

export function MonetizationSettingsForm({ values }: { values: Record<string, unknown> }) {
  const [state, action] = useActionState(updateMonetizationSettingsAction, initialAdminState);
  return <form action={action} className="mt-10 space-y-6">
    <FormMessage status={state.status} message={state.message} />
    <FormSection title="Monetization" description="Configure each ad format independently. Codes are stored in the database so you can change networks without editing the source code.">
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="smartLinkEnabled" defaultChecked={Boolean(values.smartLinkEnabled)} className="size-4 accent-[var(--color-accent)]" /> Smart Link</label>
      <TextField label="Smart Link URL" name="smartLinkUrl" type="url" defaultValue={String(values.smartLinkUrl ?? "")} errors={state.fieldErrors?.smartLinkUrl} hint="The CPA Smart Link destination." />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><label htmlFor="smartLinkTriggerMode" className="block text-sm font-medium text-ink">Trigger mode</label><select id="smartLinkTriggerMode" name="smartLinkTriggerMode" defaultValue={String(values.smartLinkTriggerMode ?? "fixed")} className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"><option value="fixed">Fixed clicks</option><option value="random_2_3">Random 2–3 clicks</option></select></div>
        <TextField label="Trigger count" name="smartLinkTriggerCount" type="number" min={1} max={3} defaultValue={Number(values.smartLinkTriggerCount ?? 2)} errors={state.fieldErrors?.smartLinkTriggerCount} />
      </div>
    </FormSection>

    <FormSection title="Popunder" description="Usually site-wide. Paste the exact script supplied by your ad network.">
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="popunderEnabled" defaultChecked={Boolean(values.popunderEnabled)} className="size-4 accent-[var(--color-accent)]" /> Enable Popunder</label>
      <CodeEditor name="popunderCode" label="Popunder code" defaultValue={String(values.popunderCode ?? "")} hint="Test preview blocks top-level popups. Production runs the saved code normally." error={state.fieldErrors?.popunderCode} />
    </FormSection>

    <FormSection title="Native Banner"><label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="nativeBannerEnabled" defaultChecked={Boolean(values.nativeBannerEnabled)} className="size-4 accent-[var(--color-accent)]" /> Enable Native Banner</label><div className="space-y-1.5"><label htmlFor="nativeBannerPlacement" className="block text-sm font-medium text-ink">Placement</label><select id="nativeBannerPlacement" name="nativeBannerPlacement" defaultValue={String(values.nativeBannerPlacement ?? "home")} className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"><option value="home">Home page</option><option value="listing">Listing / category / search</option><option value="video">Video page</option></select></div><CodeEditor name="nativeBannerCode" label="Native Banner code" defaultValue={String(values.nativeBannerCode ?? "")} hint="Choose one placement above." error={state.fieldErrors?.nativeBannerCode} /></FormSection>

    <FormSection title="Social Bar" description="Global site-wide code."><label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="socialBarEnabled" defaultChecked={Boolean(values.socialBarEnabled)} className="size-4 accent-[var(--color-accent)]" /> Enable Social Bar</label><CodeEditor name="socialBarCode" label="Social Bar code" defaultValue={String(values.socialBarCode ?? "")} hint="Use the exact script from your network." error={state.fieldErrors?.socialBarCode} /></FormSection>

    <FormSection title="Banner"><label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="bannerEnabled" defaultChecked={Boolean(values.bannerEnabled)} className="size-4 accent-[var(--color-accent)]" /> Enable Banner</label><div className="space-y-1.5"><label htmlFor="bannerPlacement" className="block text-sm font-medium text-ink">Placement</label><select id="bannerPlacement" name="bannerPlacement" defaultValue={String(values.bannerPlacement ?? "home")} className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"><option value="home">Home page</option><option value="listing">Listing / category / search</option><option value="video">Video page</option></select></div><CodeEditor name="bannerCode" label="Banner code" defaultValue={String(values.bannerCode ?? "")} hint="Choose one placement above." error={state.fieldErrors?.bannerCode} /></FormSection>

    <FormSection title="Body Ad Code" description="Loaded globally after the page body mounts. Use the exact script/HTML from your network."><label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="bodyAdEnabled" defaultChecked={Boolean(values.bodyAdEnabled)} className="size-4 accent-[var(--color-accent)]" /> Enable Body Ad Code</label><CodeEditor name="bodyAdCode" label="Body Ad code" defaultValue={String(values.bodyAdCode ?? "")} hint="This is injected at runtime into document.body." error={state.fieldErrors?.bodyAdCode} /></FormSection>

    <SubmitButton pendingLabel="Saving…">Save monetization settings</SubmitButton>
  </form>;
}
