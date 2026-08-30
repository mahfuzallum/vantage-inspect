"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { AUDIT_ACTIONS, recordAudit } from "@/server/services/audit-service";
import {
  SOCIAL_PLATFORMS,
  adminCategorySchema,
  adminCreatorSchema,
  adminTagSchema,
  deleteCategorySchema,
  mergeTagsSchema,
} from "@/validation/admin";
import { slugify, uniqueSlug } from "@/lib/utils/slug";
import { cuidSchema } from "@/validation/common";
import { routes } from "@/config/routes";
import type { AdminFormState } from "./admin-content";

export type { AdminFormState } from "./admin-content";

function fieldErrorsFrom(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const output: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    (output[key] ??= []).push(issue.message);
  }
  return output;
}

// ---------------------------------------------------------------- creators

export async function saveCreatorAction(
  creatorId: string | null,
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireStaff();

  // One field per platform on the form, collapsed into a single object here.
  const socialLinks: Record<string, string> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const value = String(formData.get(`social.${platform.key}`) ?? "").trim();
    if (value) socialLinks[platform.key] = value;
  }

  const parsed = adminCreatorSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    bio: formData.get("bio") ?? undefined,
    about: formData.get("about") ?? undefined,
    socialLinks,
    startedAt: formData.get("startedAt") ?? undefined,
    websiteUrl: formData.get("websiteUrl") ?? undefined,
    avatarUrl: formData.get("avatarUrl") ?? undefined,
    isVerified: formData.get("isVerified") === "on",
    isActive: formData.get("isActive") === "on",
    seoTitle: formData.get("seoTitle") ?? undefined,
    seoDescription: formData.get("seoDescription") ?? undefined,
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };

  const data = parsed.data;
  let targetId = creatorId;

  try {
    // Only a real, entered address is stored — nothing is fabricated.
    let avatarId: string | null = null;
    if (data.avatarUrl) {
      const asset = await db.mediaAsset.create({
        data: {
          kind: "IMAGE",
          provider: "EXTERNAL",
          url: data.avatarUrl,
          uploadedById: admin.id,
        },
        select: { id: true },
      });
      avatarId = asset.id;
    }

    if (creatorId) {
      const existing = await db.creator.findUnique({
        where: { id: creatorId },
        select: { slug: true, avatarId: true },
      });
      if (!existing) return { status: "error", message: "That contributor no longer exists." };

      let slug = existing.slug;
      if (data.slug && data.slug !== existing.slug) {
        slug = await uniqueSlug(data.slug, async (candidate) =>
          Boolean(
            await db.creator.findFirst({
              where: { slug: candidate, id: { not: creatorId } },
              select: { id: true },
            }),
          ),
        );
      }

      await db.creator.update({
        where: { id: creatorId },
        data: {
          name: data.name,
          slug,
          bio: data.bio ?? null,
          about: data.about ?? null,
          websiteUrl: data.websiteUrl ?? null,
          socialLinks:
            data.socialLinks && Object.keys(data.socialLinks).length > 0
              ? (data.socialLinks as never)
              : undefined,
          // A cleared date means unknown and is stored as such.
          startedAt: data.startedAt ? new Date(`${data.startedAt}T00:00:00Z`) : null,
          isVerified: data.isVerified,
          isActive: data.isActive,
          seoTitle: data.seoTitle ?? null,
          seoDescription: data.seoDescription ?? null,
          avatarId: avatarId ?? existing.avatarId,
        },
      });

      await recordAudit({
        actorId: admin.id,
        action: AUDIT_ACTIONS.CREATOR_UPDATED,
        entityType: "creator",
        entityId: creatorId,
        metadata: { name: data.name },
      });
    } else {
      const slug = await uniqueSlug(data.slug ?? slugify(data.name), async (candidate) =>
        Boolean(await db.creator.findUnique({ where: { slug: candidate }, select: { id: true } })),
      );

      const created = await db.creator.create({
        data: {
          name: data.name,
          slug,
          bio: data.bio ?? null,
          about: data.about ?? null,
          websiteUrl: data.websiteUrl ?? null,
          socialLinks:
            data.socialLinks && Object.keys(data.socialLinks).length > 0
              ? (data.socialLinks as never)
              : undefined,
          // A cleared date means unknown and is stored as such.
          startedAt: data.startedAt ? new Date(`${data.startedAt}T00:00:00Z`) : null,
          isVerified: data.isVerified,
          isActive: data.isActive,
          seoTitle: data.seoTitle ?? null,
          seoDescription: data.seoDescription ?? null,
          avatarId,
        },
        select: { id: true },
      });
      targetId = created.id;

      await recordAudit({
        actorId: admin.id,
        action: AUDIT_ACTIONS.CREATOR_CREATED,
        entityType: "creator",
        entityId: targetId,
        metadata: { name: data.name },
      });
    }
  } catch (error) {
    console.error("[admin] creator save failed:", error);
    return { status: "error", message: "That didn't save. Try again." };
  }

  revalidatePath(routes.admin.creators);
  if (!creatorId && targetId) redirect(routes.admin.creatorEdit(targetId));
  return { status: "success", message: "Saved." };
}

/**
 * Deleting a contributor detaches their recordings rather than destroying
 * them — `onDelete: SetNull` on the relation means the archive keeps the
 * material and simply loses the attribution.
 */
export async function deleteCreatorAction(creatorId: string): Promise<void> {
  const admin = await requireAdmin();
  const id = cuidSchema.safeParse(creatorId);
  if (!id.success) return;

  const existing = await db.creator.findUnique({
    where: { id: id.data },
    select: { name: true, contentCount: true },
  });
  if (!existing) return;

  await db.creator.delete({ where: { id: id.data } });

  await recordAudit({
    actorId: admin.id,
    action: AUDIT_ACTIONS.CREATOR_DELETED,
    entityType: "creator",
    entityId: id.data,
    metadata: { name: existing.name, detachedContent: existing.contentCount },
  });

  revalidatePath(routes.admin.creators);
}

// ---------------------------------------------------------------- categories

export async function saveCategoryAction(
  categoryId: string | null,
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireStaff();

  const parsed = adminCategorySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    description: formData.get("description") ?? undefined,
    iconKey: formData.get("iconKey") ?? undefined,
    parentId: formData.get("parentId") ?? undefined,
    position: formData.get("position") ?? 0,
    isActive: formData.get("isActive") === "on",
    seoTitle: formData.get("seoTitle") ?? undefined,
    seoDescription: formData.get("seoDescription") ?? undefined,
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };

  const data = parsed.data;

  // A category cannot be its own parent.
  if (categoryId && data.parentId === categoryId) {
    return { status: "error", fieldErrors: { parentId: ["A subject cannot be its own parent."] } };
  }

  try {
    if (categoryId) {
      const existing = await db.category.findUnique({
        where: { id: categoryId },
        select: { slug: true },
      });
      if (!existing) return { status: "error", message: "That subject no longer exists." };

      let slug = existing.slug;
      if (data.slug && data.slug !== existing.slug) {
        slug = await uniqueSlug(data.slug, async (candidate) =>
          Boolean(
            await db.category.findFirst({
              where: { slug: candidate, id: { not: categoryId } },
              select: { id: true },
            }),
          ),
        );
      }

      await db.category.update({
        where: { id: categoryId },
        data: {
          name: data.name,
          slug,
          description: data.description ?? null,
          iconKey: data.iconKey ?? null,
          parentId: data.parentId ?? null,
          position: data.position,
          isActive: data.isActive,
          seoTitle: data.seoTitle ?? null,
          seoDescription: data.seoDescription ?? null,
        },
      });

      await recordAudit({
        actorId: admin.id,
        action: AUDIT_ACTIONS.CATEGORY_UPDATED,
        entityType: "category",
        entityId: categoryId,
        metadata: { name: data.name },
      });
    } else {
      const slug = await uniqueSlug(data.slug ?? slugify(data.name), async (candidate) =>
        Boolean(await db.category.findUnique({ where: { slug: candidate }, select: { id: true } })),
      );

      const created = await db.category.create({
        data: {
          name: data.name,
          slug,
          description: data.description ?? null,
          iconKey: data.iconKey ?? null,
          parentId: data.parentId ?? null,
          position: data.position,
          isActive: data.isActive,
          seoTitle: data.seoTitle ?? null,
          seoDescription: data.seoDescription ?? null,
        },
        select: { id: true },
      });

      await recordAudit({
        actorId: admin.id,
        action: AUDIT_ACTIONS.CATEGORY_CREATED,
        entityType: "category",
        entityId: created.id,
        metadata: { name: data.name },
      });
    }
  } catch (error) {
    console.error("[admin] category save failed:", error);
    return { status: "error", message: "That didn't save. Try again." };
  }

  revalidatePath(routes.admin.categories);
  return { status: "success", message: "Saved." };
}

/**
 * Deleting a subject.
 *
 * A subject holding content is never silently removed: the administrator must
 * either reassign that content to another subject or accept that it becomes
 * uncategorised. Both happen inside one transaction, so content can never be
 * left pointing at a subject that no longer exists.
 */
export async function deleteCategoryAction(
  categoryId: string,
  reassignToId?: string,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();

  const parsed = deleteCategorySchema.safeParse({
    id: categoryId,
    reassignToId: reassignToId ?? "",
    confirmed: true,
  });
  if (!parsed.success) return { ok: false, message: "Unknown subject." };

  try {
    const existing = await db.category.findUnique({
      where: { id: parsed.data.id },
      select: { name: true, contentCount: true, children: { select: { id: true } } },
    });
    if (!existing) return { ok: false, message: "That subject no longer exists." };

    if (existing.children.length > 0) {
      return {
        ok: false,
        message: "Move or delete the child subjects first.",
      };
    }

    await db.$transaction(async (tx) => {
      if (parsed.data.reassignToId) {
        await tx.content.updateMany({
          where: { categoryId: parsed.data.id },
          data: { categoryId: parsed.data.reassignToId },
        });
      }
      // Any remaining content is set to null by the relation's SetNull rule.
      await tx.category.delete({ where: { id: parsed.data.id } });
    });

    await recordAudit({
      actorId: admin.id,
      action: AUDIT_ACTIONS.CATEGORY_DELETED,
      entityType: "category",
      entityId: parsed.data.id,
      metadata: {
        name: existing.name,
        contentAffected: existing.contentCount,
        reassignedTo: parsed.data.reassignToId ?? null,
      },
    });
  } catch (error) {
    console.error("[admin] category delete failed:", error);
    return { ok: false, message: "That didn't complete. Try again." };
  }

  revalidatePath(routes.admin.categories);
  return { ok: true, message: "Subject deleted." };
}

// ---------------------------------------------------------------- tags

export async function saveTagAction(
  tagId: string | null,
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireStaff();

  const parsed = adminTagSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };

  const data = parsed.data;

  try {
    if (tagId) {
      const existing = await db.tag.findUnique({ where: { id: tagId }, select: { slug: true } });
      if (!existing) return { status: "error", message: "That topic no longer exists." };

      let slug = existing.slug;
      if (data.slug && data.slug !== existing.slug) {
        slug = await uniqueSlug(data.slug, async (candidate) =>
          Boolean(
            await db.tag.findFirst({
              where: { slug: candidate, id: { not: tagId } },
              select: { id: true },
            }),
          ),
        );
      }

      await db.tag.update({
        where: { id: tagId },
        data: { name: data.name, slug, description: data.description ?? null },
      });
      await recordAudit({
        actorId: admin.id,
        action: AUDIT_ACTIONS.TAG_UPDATED,
        entityType: "tag",
        entityId: tagId,
        metadata: { name: data.name },
      });
    } else {
      const slug = await uniqueSlug(data.slug ?? slugify(data.name), async (candidate) =>
        Boolean(await db.tag.findUnique({ where: { slug: candidate }, select: { id: true } })),
      );
      const created = await db.tag.create({
        data: { name: data.name, slug, description: data.description ?? null },
        select: { id: true },
      });
      await recordAudit({
        actorId: admin.id,
        action: AUDIT_ACTIONS.TAG_CREATED,
        entityType: "tag",
        entityId: created.id,
        metadata: { name: data.name },
      });
    }
  } catch (error) {
    console.error("[admin] tag save failed:", error);
    return { status: "error", message: "That didn't save. Try again." };
  }

  revalidatePath(routes.admin.tags);
  return { status: "success", message: "Saved." };
}

/** Tag links cascade, so no orphaned ContentTag row can survive the delete. */
export async function deleteTagAction(tagId: string): Promise<void> {
  const admin = await requireAdmin();
  const id = cuidSchema.safeParse(tagId);
  if (!id.success) return;

  const existing = await db.tag.findUnique({
    where: { id: id.data },
    select: { name: true, contentCount: true },
  });
  if (!existing) return;

  await db.tag.delete({ where: { id: id.data } });

  await recordAudit({
    actorId: admin.id,
    action: AUDIT_ACTIONS.TAG_DELETED,
    entityType: "tag",
    entityId: id.data,
    metadata: { name: existing.name, linksRemoved: existing.contentCount },
  });

  revalidatePath(routes.admin.tags);
}

/**
 * Merges one topic into another: every link is moved, then the source is
 * removed. `skipDuplicates` handles content already carrying both.
 */
export async function mergeTagsAction(
  sourceId: string,
  targetId: string,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();

  const parsed = mergeTagsSchema.safeParse({ sourceId, targetId });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Pick two topics." };
  }

  try {
    await db.$transaction(async (tx) => {
      const links = await tx.contentTag.findMany({
        where: { tagId: parsed.data.sourceId },
        select: { contentId: true },
      });

      if (links.length > 0) {
        await tx.contentTag.createMany({
          data: links.map((link) => ({ contentId: link.contentId, tagId: parsed.data.targetId })),
          skipDuplicates: true,
        });
      }

      await tx.tag.delete({ where: { id: parsed.data.sourceId } });

      await tx.tag.update({
        where: { id: parsed.data.targetId },
        data: {
          contentCount: await tx.contentTag.count({ where: { tagId: parsed.data.targetId } }),
        },
      });
    });

    await recordAudit({
      actorId: admin.id,
      action: AUDIT_ACTIONS.TAG_MERGED,
      entityType: "tag",
      entityId: parsed.data.targetId,
      metadata: { mergedFrom: parsed.data.sourceId },
    });
  } catch (error) {
    console.error("[admin] tag merge failed:", error);
    return { ok: false, message: "That didn't complete. Try again." };
  }

  revalidatePath(routes.admin.tags);
  return { ok: true, message: "Topics merged." };
}
