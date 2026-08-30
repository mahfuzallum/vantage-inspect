"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireStaff, requireAdmin } from "@/lib/auth/guards";

import {
  AUDIT_ACTIONS,
  recordAudit,
} from "@/server/services/audit-service";

import {
  adminContentSchema,
  bulkContentSchema,
} from "@/validation/admin";

import {
  slugify,
  uniqueSlug,
} from "@/lib/utils/slug";

import { cuidSchema } from "@/validation/common";
import { routes } from "@/config/routes";

import {
  mediaProvider,
} from "@/lib/media";

import {
  storagePaths,
} from "@/lib/media/paths";

import type { AdminFormState } from "./admin-form-state";

export type { AdminFormState } from "./admin-form-state";

function fieldErrorsFrom(
  error: {
    issues: Array<{
      path: PropertyKey[];
      message: string;
    }>;
  },
) {
  const output: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = String(
      issue.path[0] ?? "_",
    );

    (output[key] ??= []).push(
      issue.message,
    );
  }

  return output;
}

/**
 * Reads the shared content form into a plain object.
 */
function readContentForm(
  formData: FormData,
) {
  return {
    title: formData.get("title"),

    slug:
      formData.get("slug") ||
      undefined,

    summary:
      formData.get("summary") ??
      undefined,

    description:
      formData.get("description") ??
      undefined,

    kind:
      formData.get("kind") ??
      "VIDEO",

    status:
      formData.get("status") ??
      "DRAFT",

    isFeatured:
      formData.get("isFeatured") ===
      "on",

    durationSeconds:
      formData.get("durationSeconds") ||
      undefined,

    language:
      formData.get("language") ??
      undefined,

    creatorId:
      formData.get("creatorId") ??
      undefined,

    categoryId:
      formData.get("categoryId") ??
      undefined,

    tagIds:
      formData
        .getAll("tagIds")
        .map(String)
        .filter(Boolean),

    thumbnailUrl:
      formData.get("thumbnailUrl") ??
      undefined,

    externalUrl:
      formData.get("externalUrl") ??
      undefined,

    seoTitle:
      formData.get("seoTitle") ??
      undefined,

    seoDescription:
      formData.get("seoDescription") ??
      undefined,

    ogImageUrl:
      formData.get("ogImageUrl") ??
      undefined,
  };
}

/**
 * Attaches an external image as a media asset
 * without an upload pipeline.
 */
async function externalAsset(
  url: string | undefined,
  kind: "IMAGE" | "VIDEO",
  actorId: string,
) {
  if (!url) {
    return null;
  }

  const asset =
    await db.mediaAsset.create({
      data: {
        kind,
        provider: "EXTERNAL",
        url,
        uploadedById: actorId,
      },

      select: {
        id: true,
      },
    });

  return asset.id;
}

export async function createContentAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin =
    await requireStaff();

  const parsed =
    adminContentSchema.safeParse(
      readContentForm(formData),
    );

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors:
        fieldErrorsFrom(
          parsed.error,
        ),
    };
  }

  const data = parsed.data;

  let contentId: string;

  try {
    const slug =
      await uniqueSlug(
        data.slug ??
          slugify(data.title),

        async (
          candidate,
        ) =>
          Boolean(
            await db.content.findUnique({
              where: {
                slug: candidate,
              },

              select: {
                id: true,
              },
            }),
          ),
      );

    const thumbnailId =
      await externalAsset(
        data.thumbnailUrl,
        "IMAGE",
        admin.id,
      );

    const created =
      await db.$transaction(
        async (tx) => {
          const content =
            await tx.content.create({
              data: {
                slug,
                title: data.title,
                summary:
                  data.summary ?? null,
                description:
                  data.description ?? null,
                kind: data.kind,
                status: data.status,
                isFeatured:
                  data.isFeatured,
                durationSeconds:
                  data.durationSeconds ??
                  null,
                language:
                  data.language ?? null,
                creatorId:
                  data.creatorId ?? null,
                categoryId:
                  data.categoryId ?? null,
                thumbnailId,
                externalUrl:
                  data.externalUrl ?? null,
                seoTitle:
                  data.seoTitle ?? null,
                seoDescription:
                  data.seoDescription ??
                  null,
                ogImageUrl:
                  data.ogImageUrl ?? null,
                publishedAt:
                  data.status ===
                  "PUBLISHED"
                    ? new Date()
                    : null,
              },

              select: {
                id: true,
              },
            });

          if (
            data.tagIds.length > 0
          ) {
            await tx.contentTag.createMany(
              {
                data:
                  data.tagIds.map(
                    (tagId) => ({
                      contentId:
                        content.id,
                      tagId,
                    }),
                  ),

                skipDuplicates: true,
              },
            );
          }

          return content;
        },
      );

    contentId =
      created.id;

    await recordAudit({
      actorId: admin.id,
      action:
        AUDIT_ACTIONS.CONTENT_CREATED,
      entityType: "content",
      entityId: contentId,
      metadata: {
        title: data.title,
        status: data.status,
      },
    });
  } catch (error) {
    console.error(
      "[admin] content create failed:",
      error,
    );

    return {
      status: "error",
      message:
        "That didn't save. Try again.",
    };
  }

  revalidatePath(
    routes.admin.content,
  );

  redirect(
    routes.admin.contentEdit(
      contentId,
    ),
  );
}

export async function updateContentAction(
  contentId: string,
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin =
    await requireStaff();

  const id =
    cuidSchema.safeParse(
      contentId,
    );

  if (!id.success) {
    return {
      status: "error",
      message: "Unknown record.",
    };
  }

  const parsed =
    adminContentSchema.safeParse(
      readContentForm(formData),
    );

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors:
        fieldErrorsFrom(
          parsed.error,
        ),
    };
  }

  const data = parsed.data;

  try {
    const existing =
      await db.content.findUnique({
        where: {
          id: id.data,
        },

        select: {
          id: true,
          slug: true,
          status: true,
          publishedAt: true,
          thumbnailId: true,
        },
      });

    if (!existing) {
      return {
        status: "error",
        message:
          "That record no longer exists.",
      };
    }

    let slug =
      existing.slug;

    if (
      data.slug &&
      data.slug !== existing.slug
    ) {
      slug =
        await uniqueSlug(
          data.slug,

          async (
            candidate,
          ) =>
            Boolean(
              await db.content.findFirst({
                where: {
                  slug: candidate,
                  id: {
                    not: id.data,
                  },
                },

                select: {
                  id: true,
                },
              }),
            ),
        );
    }

    const thumbnailId =
      data.thumbnailUrl
        ? (
            (await externalAsset(
              data.thumbnailUrl,
              "IMAGE",
              admin.id,
            )) ??
            existing.thumbnailId
          )
        : existing.thumbnailId;

    await db.$transaction(
      async (tx) => {
        await tx.content.update({
          where: {
            id: id.data,
          },

          data: {
            slug,
            title: data.title,
            summary:
              data.summary ?? null,
            description:
              data.description ?? null,
            kind: data.kind,
            status: data.status,
            isFeatured:
              data.isFeatured,
            durationSeconds:
              data.durationSeconds ??
              null,
            language:
              data.language ?? null,
            creatorId:
              data.creatorId ?? null,
            categoryId:
              data.categoryId ?? null,
            thumbnailId,
            externalUrl:
              data.externalUrl ?? null,
            seoTitle:
              data.seoTitle ?? null,
            seoDescription:
              data.seoDescription ??
              null,
            ogImageUrl:
              data.ogImageUrl ?? null,

            publishedAt:
              data.status ===
              "PUBLISHED"
                ? (
                    existing.publishedAt ??
                    new Date()
                  )
                : existing.publishedAt,
          },
        });

        await tx.contentTag.deleteMany({
          where: {
            contentId: id.data,
          },
        });

        if (
          data.tagIds.length > 0
        ) {
          await tx.contentTag.createMany(
            {
              data:
                data.tagIds.map(
                  (tagId) => ({
                    contentId:
                      id.data,
                    tagId,
                  }),
                ),

              skipDuplicates: true,
            },
          );
        }
      },
    );

    await recordAudit({
      actorId: admin.id,
      action:
        AUDIT_ACTIONS.CONTENT_UPDATED,
      entityType: "content",
      entityId: id.data,
      metadata: {
        title: data.title,
        status: data.status,
      },
    });
  } catch (error) {
    console.error(
      "[admin] content update failed:",
      error,
    );

    return {
      status: "error",
      message:
        "That didn't save. Try again.",
    };
  }

  revalidatePath(
    routes.admin.content,
  );

  revalidatePath(
    routes.content(
      data.slug ?? "",
    ),
  );

  return {
    status: "success",
    message: "Saved.",
  };
}

/**
 * Single-record status change.
 */
export async function setContentStatusAction(
  contentId: string,
  status:
    | "DRAFT"
    | "PUBLISHED"
    | "ARCHIVED",
): Promise<void> {
  const admin =
    await requireStaff();

  const id =
    cuidSchema.safeParse(
      contentId,
    );

  if (!id.success) {
    return;
  }

  const existing =
    await db.content.findUnique({
      where: {
        id: id.data,
      },

      select: {
        publishedAt: true,
      },
    });

  if (!existing) {
    return;
  }

  await db.content.update({
    where: {
      id: id.data,
    },

    data: {
      status,

      publishedAt:
        status === "PUBLISHED"
          ? (
              existing.publishedAt ??
              new Date()
            )
          : existing.publishedAt,
    },
  });

  await recordAudit({
    actorId: admin.id,

    action:
      status === "PUBLISHED"
        ? AUDIT_ACTIONS.CONTENT_PUBLISHED
        : status === "ARCHIVED"
          ? AUDIT_ACTIONS.CONTENT_ARCHIVED
          : AUDIT_ACTIONS.CONTENT_UNPUBLISHED,

    entityType: "content",
    entityId: id.data,
  });

  revalidatePath(
    routes.admin.content,
  );
}

export async function toggleFeaturedAction(
  contentId: string,
): Promise<void> {
  const admin =
    await requireStaff();

  const id =
    cuidSchema.safeParse(
      contentId,
    );

  if (!id.success) {
    return;
  }

  const existing =
    await db.content.findUnique({
      where: {
        id: id.data,
      },

      select: {
        isFeatured: true,
      },
    });

  if (!existing) {
    return;
  }

  await db.content.update({
    where: {
      id: id.data,
    },

    data: {
      isFeatured:
        !existing.isFeatured,
    },
  });

  await recordAudit({
    actorId: admin.id,
    action:
      AUDIT_ACTIONS.CONTENT_FEATURED,
    entityType: "content",
    entityId: id.data,
    metadata: {
      featured:
        !existing.isFeatured,
    },
  });

  revalidatePath(
    routes.admin.content,
  );
}

/**
 * Deletes all physical media belonging to one video.
 *
 * Storage cleanup happens before the database record is deleted,
 * because the asset metadata is still available at this point.
 */
async function deleteVideoStorage(
  contentId: string,
  assets: Array<{
    id: string;
    provider:
      | "LOCAL"
      | "S3"
      | "EXTERNAL";
    bucket: string | null;
    objectKey: string | null;
    url: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  }>,
): Promise<void> {
  /*
   * Use the storage-neutral provider directly.
   *
   * The database query intentionally selects only the fields
   * required for physical storage cleanup, so we do not pass the
   * partial object to deleteAsset(), which expects a complete
   * MediaAsset record.
   */
  const storage =
    mediaProvider();

  /*
   * Delete individual media assets.
   */
  for (const asset of assets) {
    /*
     * External URLs do not belong to our storage backend.
     */
    if (
      asset.provider ===
      "EXTERNAL"
    ) {
      continue;
    }

    if (!asset.objectKey) {
      continue;
    }

    try {
      await storage.delete({
        provider:
          asset.provider,

        bucket:
          asset.bucket,

        objectKey:
          asset.objectKey,

        url:
          asset.url,

        mimeType:
          asset.mimeType,

        sizeBytes:
          asset.sizeBytes,
      });
    } catch (error) {
      /*
       * Continue cleanup if one physical asset
       * is already missing.
       */
      console.error(
        `[admin] media delete failed content=${contentId} asset=${asset.id}`,
        error,
      );
    }
  }

  /*
   * HLS files, generated thumbnails and hover previews
   * are stored under deterministic content/video prefixes.
   *
   * These files are not necessarily represented by
   * individual MediaAsset rows.
   */
  const prefixes =
    storagePaths.prefixes(
      contentId,
    );

  for (
    const prefix of prefixes
  ) {
    try {
      await storage.deletePrefix(
        prefix,
      );
    } catch (error) {
      /*
       * Prefix cleanup is best-effort.
       *
       * A missing generated directory should not
       * prevent the database record from being deleted.
       */
      console.error(
        `[admin] media prefix delete failed content=${contentId} prefix=${prefix}`,
        error,
      );
    }
  }
}

/**
 * Internal deletion implementation.
 *
 * IMPORTANT:
 *
 * This function NEVER redirects.
 *
 * Single deletion uses it and redirects afterwards.
 * Bulk deletion uses it repeatedly and therefore can
 * finish every selected record.
 */
async function deleteContentById(
  contentId: string,
  actorId: string,
): Promise<{
  title: string;
  slug: string;
} | null> {
  const id =
    cuidSchema.safeParse(
      contentId,
    );

  if (!id.success) {
    return null;
  }

  /*
   * Load all information required before deletion.
   */
  const existing =
    await db.content.findUnique({
      where: {
        id: id.data,
      },

      select: {
        id: true,
        title: true,
        slug: true,

        thumbnail: {
          select: {
            id: true,
            provider: true,
            bucket: true,
            objectKey: true,
            url: true,
            mimeType: true,
            sizeBytes: true,
          },
        },

        source: {
          select: {
            id: true,
            provider: true,
            bucket: true,
            objectKey: true,
            url: true,
            mimeType: true,
            sizeBytes: true,
          },
        },
      },
    });

  if (!existing) {
    return null;
  }

  /*
   * Collect source and thumbnail assets.
   *
   * A Map prevents the same asset from being
   * deleted twice.
   */
  const assets = [
    existing.source,
    existing.thumbnail,
  ].filter(
    (
      asset,
    ): asset is NonNullable<
      typeof asset
    > =>
      Boolean(asset),
  );

  const uniqueAssets =
    Array.from(
      new Map(
        assets.map(
          (asset) => [
            asset.id,
            asset,
          ],
        ),
      ).values(),
    );

  /*
   * Delete physical media first.
   */
  await deleteVideoStorage(
    id.data,
    uniqueAssets,
  );

  /*
   * Delete database record.
   */
  await db.content.delete({
    where: {
      id: id.data,
    },
  });

  /*
   * Record the deletion in the audit log.
   */
  await recordAudit({
    actorId,
    action:
      AUDIT_ACTIONS.CONTENT_DELETED,
    entityType: "content",
    entityId: id.data,
    metadata: {
      title: existing.title,
      slug: existing.slug,
    },
  });

  /*
   * Refresh admin content list.
   */
  revalidatePath(
    routes.admin.content,
  );

  /*
   * Invalidate the deleted public page.
   *
   * This is important when the deleted content
   * was previously published or cached.
   */
  revalidatePath(
    routes.content(
      existing.slug,
    ),
  );

  return {
    title: existing.title,
    slug: existing.slug,
  };
}

/**
 * Deletes one content record.
 *
 * Permanent deletion is ADMIN-only.
 *
 * After deletion the administrator is returned
 * to the admin content list.
 */
export async function deleteContentAction(
  contentId: string,
): Promise<void> {
  const admin =
    await requireAdmin();

  const deleted =
    await deleteContentById(
      contentId,
      admin.id,
    );

  if (!deleted) {
    return;
  }

  /*
   * IMPORTANT:
   *
   * redirect() is ONLY here.
   *
   * It is not inside deleteContentById(),
   * otherwise bulk deletion would stop after
   * the first record.
   */
  redirect(
    routes.admin.content,
  );
}

/**
 * Bulk operations.
 */
export async function bulkContentAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin =
    await requireStaff();

  const parsed =
    bulkContentSchema.safeParse({
      ids:
        formData
          .getAll("ids")
          .map(String),

      action:
        formData.get("action"),

      confirmed:
        formData.get(
          "confirmed",
        ) === "true",
    });

  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]
          ?.message ??
        "Select items first.",
    };
  }

  const {
    ids,
    action,
    confirmed,
  } = parsed.data;

  try {
    if (
      action === "delete"
    ) {
      /*
       * Permanent deletion remains ADMIN-only.
       */
      if (
        admin.role !==
        "ADMIN"
      ) {
        return {
          status: "error",
          message:
            "Only an administrator can delete records.",
        };
      }

      /*
       * Explicit confirmation is still required.
       */
      if (!confirmed) {
        return {
          status: "error",
          message:
            "Confirm the deletion before continuing.",
        };
      }

      let deletedCount = 0;

      /*
       * Use the internal helper.
       *
       * DO NOT use deleteContentAction() here,
       * because that function redirects.
       */
      for (const id of ids) {
        try {
          const deleted =
            await deleteContentById(
              id,
              admin.id,
            );

          if (deleted) {
            deletedCount += 1;
          }
        } catch (error) {
          /*
           * One failed record should not prevent
           * the remaining selected records from
           * being processed.
           */
          console.error(
            `[admin] bulk delete failed content=${id}`,
            error,
          );
        }
      }

      revalidatePath(
        routes.admin.content,
      );

      return {
        status: "success",
        message:
          `Deleted ${deletedCount} record(s).`,
      };
    }

    const data =
      action === "publish"
        ? {
            status:
              "PUBLISHED" as const,
            publishedAt:
              new Date(),
          }
        : action === "unpublish"
          ? {
              status:
                "DRAFT" as const,
            }
          : action === "archive"
            ? {
                status:
                  "ARCHIVED" as const,
              }
            : {
                isFeatured:
                  action ===
                  "feature",
              };

    await db.content.updateMany({
      where: {
        id: {
          in: ids,
        },
      },

      data,
    });

    await recordAudit({
      actorId: admin.id,
      action:
        AUDIT_ACTIONS.CONTENT_UPDATED,
      entityType: "content",
      metadata: {
        bulk: true,
        action,
        count: ids.length,
      },
    });

    revalidatePath(
      routes.admin.content,
    );

    return {
      status: "success",
      message:
        `Updated ${ids.length} record(s).`,
    };
  } catch (error) {
    console.error(
      "[admin] bulk action failed:",
      error,
    );

    return {
      status: "error",
      message:
        "That didn't complete. Try again.",
    };
  }
}