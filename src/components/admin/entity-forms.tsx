"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  saveCategoryAction,
  saveCreatorAction,
  saveTagAction,
} from "@/server/actions/admin-taxonomy";
import { initialAdminState as initialTaxonomyState } from "@/server/actions/admin-form-state";
import { TextField } from "@/components/forms/text-field";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { FormSection } from "./admin-shell";
import { Textarea, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { MediaUploader } from "./media-uploader";
import { SOCIAL_PLATFORMS } from "@/validation/admin";
import { routes } from "@/config/routes";

export type CreatorValues = {
  id?: string;
  name: string;
  slug: string;
  bio: string;
  websiteUrl: string;
  about: string;
  socialLinks: Record<string, string>;
  /** ISO date (YYYY-MM-DD) or empty when unknown. */
  startedAt: string;
  avatarUrl: string;
  isVerified: boolean;
  isActive: boolean;
  seoTitle: string;
  seoDescription: string;
};

export function CreatorForm({ values }: { values: CreatorValues }) {
  const [state, action] = useActionState(
    saveCreatorAction.bind(null, values.id ?? null),
    initialTaxonomyState,
  );
  const [avatarUrl, setAvatarUrl] = useState(values.avatarUrl);

  return (
    <form action={action} className="space-y-6">
      <FormMessage status={state.status} message={state.message} />

      <FormSection title="Profile">
        <div className="flex items-center gap-4">
          <Avatar name={values.name || "?"} src={avatarUrl || null} size="lg" />
          <p className="text-meta text-ink-muted">
            The monogram is used whenever no avatar is set.
          </p>
        </div>

        {values.id ? (
          <>
            <MediaUploader
              scope="creatorAvatar"
              entityId={values.id}
              label="Avatar image"
              hint="JPEG, PNG, WebP or AVIF, up to 12MB."
              currentUrl={avatarUrl || null}
              onUploaded={(asset) => setAvatarUrl(asset.url ?? "")}
            />
            <input type="hidden" name="avatarUrl" value={avatarUrl} />
          </>
        ) : null}

        <TextField
          label="Name"
          name="name"
          required
          defaultValue={values.name}
          errors={state.fieldErrors?.name}
        />
        <TextField
          label="Slug"
          name="slug"
          defaultValue={values.slug}
          hint="Leave blank to derive one from the name."
          errors={state.fieldErrors?.slug}
        />
        <div className="space-y-1.5">
          <label htmlFor="bio" className="block text-sm font-medium text-ink">
            Bio
          </label>
          <Textarea id="bio" name="bio" rows={3} maxLength={2000} defaultValue={values.bio} />
          <p className="text-sm text-ink-muted">
            One or two lines. Shown beside the avatar on the profile.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="about" className="block text-sm font-medium text-ink">
            About
          </label>
          <Textarea
            id="about"
            name="about"
            rows={7}
            maxLength={6000}
            defaultValue={values.about}
          />
          <p className="text-sm text-ink-muted">
            The longer piece, shown under the videos. Leave blank to hide the section.
          </p>
        </div>

        <TextField
          label="Active since"
          name="startedAt"
          type="date"
          defaultValue={values.startedAt}
          hint="When they actually started — not when this record was created. Leave blank if unknown."
          errors={state.fieldErrors?.startedAt}
        />
        {values.id ? null : (
          <TextField
            label="Avatar URL"
            name="avatarUrl"
            type="url"
            defaultValue={values.avatarUrl}
            hint="Paste a URL for now; upload becomes available once the contributor is saved."
            errors={state.fieldErrors?.avatarUrl}
          />
        )}
        <TextField
          label="Website"
          name="websiteUrl"
          type="url"
          defaultValue={values.websiteUrl}
          hint="Only shown when a real address is entered. Nothing is invented."
          errors={state.fieldErrors?.websiteUrl}
        />

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-ink">Links</legend>
          <p className="text-sm text-ink-muted">
            Only the ones you fill in are shown. Nothing is guessed from the name.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SOCIAL_PLATFORMS.map((platform) => (
              <TextField
                key={platform.key}
                label={platform.label}
                name={`social.${platform.key}`}
                type="url"
                placeholder={platform.placeholder}
                defaultValue={values.socialLinks[platform.key] ?? ""}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              name="isVerified"
              defaultChecked={values.isVerified}
              className="size-4 accent-[var(--color-accent)]"
            />
            Verified
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={values.isActive}
              className="size-4 accent-[var(--color-accent)]"
            />
            Active
          </label>
        </div>
      </FormSection>

      <FormSection title="SEO">
        <TextField
          label="SEO title"
          name="seoTitle"
          maxLength={70}
          defaultValue={values.seoTitle}
        />
        <div className="space-y-1.5">
          <label htmlFor="creator-seo-desc" className="block text-sm font-medium text-ink">
            SEO description
          </label>
          <Textarea
            id="creator-seo-desc"
            name="seoDescription"
            rows={2}
            maxLength={180}
            defaultValue={values.seoDescription}
          />
        </div>
      </FormSection>

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{values.id ? "Save changes" : "Create"}</SubmitButton>
        <Button asChild variant="ghost">
          <Link href={routes.admin.creators}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

export type CategoryValues = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  parentId: string;
  position: number;
  isActive: boolean;
  seoTitle: string;
  seoDescription: string;
};

export function CategoryForm({
  values,
  parents,
}: {
  values: CategoryValues;
  parents: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState(
    saveCategoryAction.bind(null, values.id ?? null),
    initialTaxonomyState,
  );

  return (
    <form action={action} className="space-y-6">
      <FormMessage status={state.status} message={state.message} />

      <FormSection title="Subject">
        <TextField
          label="Name"
          name="name"
          required
          defaultValue={values.name}
          errors={state.fieldErrors?.name}
        />
        <TextField
          label="Slug"
          name="slug"
          defaultValue={values.slug}
          errors={state.fieldErrors?.slug}
        />
        <div className="space-y-1.5">
          <label htmlFor="category-desc" className="block text-sm font-medium text-ink">
            Description
          </label>
          <Textarea
            id="category-desc"
            name="description"
            rows={3}
            maxLength={500}
            defaultValue={values.description}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="parentId" className="block text-sm font-medium text-ink">
              Parent subject
            </label>
            <Select id="parentId" name="parentId" defaultValue={values.parentId}>
              <option value="">None — top level</option>
              {parents
                .filter((parent) => parent.id !== values.id)
                .map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name}
                  </option>
                ))}
            </Select>
            {state.fieldErrors?.parentId ? (
              <p role="alert" className="text-sm text-critical">
                {state.fieldErrors.parentId[0]}
              </p>
            ) : null}
          </div>
          <TextField
            label="Position"
            name="position"
            type="number"
            min={0}
            defaultValue={values.position}
            hint="Lower numbers appear first."
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={values.isActive}
            className="size-4 accent-[var(--color-accent)]"
          />
          Active
        </label>
      </FormSection>

      <FormSection title="SEO">
        <TextField
          label="SEO title"
          name="seoTitle"
          maxLength={70}
          defaultValue={values.seoTitle}
        />
        <div className="space-y-1.5">
          <label htmlFor="category-seo-desc" className="block text-sm font-medium text-ink">
            SEO description
          </label>
          <Textarea
            id="category-seo-desc"
            name="seoDescription"
            rows={2}
            maxLength={180}
            defaultValue={values.seoDescription}
          />
        </div>
      </FormSection>

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{values.id ? "Save changes" : "Create"}</SubmitButton>
        <Button asChild variant="ghost">
          <Link href={routes.admin.categories}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

export type TagValues = { id?: string; name: string; slug: string; description: string };

export function TagForm({ values }: { values: TagValues }) {
  const [state, action] = useActionState(
    saveTagAction.bind(null, values.id ?? null),
    initialTaxonomyState,
  );

  return (
    <form action={action} className="space-y-6">
      <FormMessage status={state.status} message={state.message} />

      <FormSection title="Topic">
        <TextField
          label="Name"
          name="name"
          required
          defaultValue={values.name}
          errors={state.fieldErrors?.name}
        />
        <TextField
          label="Slug"
          name="slug"
          defaultValue={values.slug}
          errors={state.fieldErrors?.slug}
        />
        <div className="space-y-1.5">
          <label htmlFor="tag-desc" className="block text-sm font-medium text-ink">
            Description
          </label>
          <Textarea
            id="tag-desc"
            name="description"
            rows={2}
            maxLength={300}
            defaultValue={values.description}
          />
        </div>
      </FormSection>

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{values.id ? "Save changes" : "Create"}</SubmitButton>
        <Button asChild variant="ghost">
          <Link href={routes.admin.tags}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
