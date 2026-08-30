"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createContentAction,
  updateContentAction,
  type AdminFormState,
} from "@/server/actions/admin-content";
import { initialAdminState } from "@/server/actions/admin-form-state";
import { TextField } from "@/components/forms/text-field";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { FormSection } from "./admin-shell";
import { Textarea, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Thumbnail } from "@/components/ui/thumbnail";
import { MediaUploader } from "./media-uploader";
import { routes } from "@/config/routes";

export type Option = { id: string; name: string };

export type ContentFormValues = {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  kind: string;
  status: string;
  isFeatured: boolean;
  durationSeconds: number | null;
  language: string;
  creatorId: string;
  categoryId: string;
  tagIds: string[];
  thumbnailUrl: string;
  externalUrl: string;
  seoTitle: string;
  seoDescription: string;
  ogImageUrl: string;
};

export type ContentFormProps = {
  values: ContentFormValues;
  options: { creators: Option[]; categories: Option[]; tags: Option[] };
};

/**
 * One form for both creating and editing.
 *
 * Fields are uncontrolled with `defaultValue`, so an in-progress edit is never
 * wiped by a re-render, and every value is re-validated on the server — the
 * markup here is convenience, not the rule.
 */
export function ContentForm({ values, options }: ContentFormProps) {
  const isEdit = Boolean(values.id);

  const action = isEdit
    ? updateContentAction.bind(null, values.id!)
    : (createContentAction as (
        state: AdminFormState,
        formData: FormData,
      ) => Promise<AdminFormState>);

  const [state, formAction] = useActionState(action, initialAdminState);
  // Holds the URL of a freshly uploaded thumbnail so it saves with the form.
  const [thumbnailUrl, setThumbnailUrl] = useState(values.thumbnailUrl);

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage status={state.status} message={state.message} />

      <FormSection title="Details" description="What this recording is and who deposited it.">
        <TextField
          label="Title"
          name="title"
          required
          defaultValue={values.title}
          errors={state.fieldErrors?.title}
        />

        <TextField
          label="Slug"
          name="slug"
          defaultValue={values.slug}
          hint="Leave blank to derive one from the title. Must stay unique."
          errors={state.fieldErrors?.slug}
        />

        <div className="space-y-1.5">
          <label htmlFor="summary" className="block text-sm font-medium text-ink">
            Summary
          </label>
          <Textarea
            id="summary"
            name="summary"
            rows={2}
            maxLength={300}
            defaultValue={values.summary}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="description" className="block text-sm font-medium text-ink">
            Description
          </label>
          <Textarea
            id="description"
            name="description"
            rows={6}
            defaultValue={values.description}
            placeholder="Abstract, participants, recording conditions, rights information."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="creatorId" className="block text-sm font-medium text-ink">
              Contributor
            </label>
            <Select id="creatorId" name="creatorId" defaultValue={values.creatorId}>
              <option value="">Unattributed</option>
              {options.creators.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="categoryId" className="block text-sm font-medium text-ink">
              Subject
            </label>
            <Select id="categoryId" name="categoryId" defaultValue={values.categoryId}>
              <option value="">Uncategorised</option>
              {options.categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-ink">Topics</legend>
          <div className="flex max-h-48 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-control border border-line bg-raised p-3">
            {options.tags.length === 0 ? (
              <p className="text-meta text-ink-muted">No topics yet.</p>
            ) : (
              options.tags.map((tag) => (
                <label
                  key={tag.id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted"
                >
                  <input
                    type="checkbox"
                    name="tagIds"
                    value={tag.id}
                    defaultChecked={values.tagIds.includes(tag.id)}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  {tag.name}
                </label>
              ))
            )}
          </div>
        </fieldset>
      </FormSection>

      <FormSection title="Media" description="Thumbnail and playback source.">
        {/*
          Upload is only offered once the record exists, because the storage
          key is derived from its id. On a new record the URL field is used and
          the uploader appears after the first save.
        */}
        {values.id ? (
          <>
            <MediaUploader
              scope="contentThumbnail"
              entityId={values.id}
              label="Thumbnail image"
              hint="JPEG, PNG, WebP or AVIF, up to 12MB. Replacing keeps the old image if anything else uses it."
              currentUrl={values.thumbnailUrl || null}
              onUploaded={(asset) => setThumbnailUrl(asset.url ?? "")}
            />
            {/* Carries the uploaded URL into the same form submission. */}
            <input type="hidden" name="thumbnailUrl" value={thumbnailUrl} />
          </>
        ) : null}

        {values.thumbnailUrl ? (
          <div className="relative aspect-video w-full max-w-xs overflow-hidden rounded-card border border-line bg-sunken">
            <Thumbnail
              src={values.thumbnailUrl}
              alt="Current thumbnail"
              seed={values.slug || "preview"}
              sizes="20rem"
            />
          </div>
        ) : null}

        {values.id ? null : (
          <TextField
            label="Thumbnail URL"
            name="thumbnailUrl"
            type="url"
            defaultValue={values.thumbnailUrl}
            hint="Paste a URL for now; upload becomes available once the record is saved."
            errors={state.fieldErrors?.thumbnailUrl}
          />
        )}

        <TextField
          label="External media URL"
          name="externalUrl"
          type="url"
          defaultValue={values.externalUrl}
          hint="For material hosted elsewhere. Uploaded sources are managed by the processing pipeline."
          errors={state.fieldErrors?.externalUrl}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Duration (seconds)"
            name="durationSeconds"
            type="number"
            min={0}
            defaultValue={values.durationSeconds ?? ""}
            hint="Set automatically after processing."
            errors={state.fieldErrors?.durationSeconds}
          />
          <TextField
            label="Language"
            name="language"
            maxLength={2}
            placeholder="en"
            defaultValue={values.language}
            errors={state.fieldErrors?.language}
          />
          <div className="space-y-1.5">
            <label htmlFor="kind" className="block text-sm font-medium text-ink">
              Media type
            </label>
            <Select id="kind" name="kind" defaultValue={values.kind}>
              {["VIDEO", "AUDIO", "IMAGE", "DOCUMENT"].map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </FormSection>

      <FormSection title="Publication" description="Only published recordings appear publicly.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="status" className="block text-sm font-medium text-ink">
              Status
            </label>
            <Select id="status" name="status" defaultValue={values.status}>
              <option value="DRAFT">Draft — not publicly visible</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived — hidden from listings</option>
            </Select>
          </div>

          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              name="isFeatured"
              defaultChecked={values.isFeatured}
              className="size-4 accent-[var(--color-accent)]"
            />
            Featured
          </label>
        </div>
      </FormSection>

      <FormSection title="SEO" description="Overrides the site defaults for this recording only.">
        <TextField
          label="SEO title"
          name="seoTitle"
          maxLength={70}
          defaultValue={values.seoTitle}
          hint="Falls back to the title."
          errors={state.fieldErrors?.seoTitle}
        />
        <div className="space-y-1.5">
          <label htmlFor="seoDescription" className="block text-sm font-medium text-ink">
            SEO description
          </label>
          <Textarea
            id="seoDescription"
            name="seoDescription"
            rows={2}
            maxLength={180}
            defaultValue={values.seoDescription}
          />
        </div>
        <TextField
          label="Social image URL"
          name="ogImageUrl"
          type="url"
          defaultValue={values.ogImageUrl}
          errors={state.fieldErrors?.ogImageUrl}
        />
      </FormSection>

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{isEdit ? "Save changes" : "Create"}</SubmitButton>
        <Button asChild variant="ghost">
          <Link href={routes.admin.content}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
