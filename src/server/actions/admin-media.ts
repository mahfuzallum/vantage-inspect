"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { deleteAsset, referenceCount } from "@/server/services/media-service";
import { AUDIT_ACTIONS, recordAudit } from "@/server/services/audit-service";
import { cuidSchema } from "@/validation/common";
import { routes } from "@/config/routes";

export type MediaActionResult = { ok: boolean; message: string };

/**
 * Deletes a media asset.
 *
 * Refuses while anything still references it — a shared image must not vanish
 * because one of its users was removed. Deleting media is ADMIN-only, and the
 * outcome is always reported rather than silently swallowed.
 */
export async function deleteMediaAction(assetId: string): Promise<MediaActionResult> {
  const admin = await requireAdmin();

  const id = cuidSchema.safeParse(assetId);
  if (!id.success) return { ok: false, message: "Unknown asset." };

  const outcome = await deleteAsset(id.data);

  switch (outcome.status) {
    case "deleted":
      await recordAudit({
        actorId: admin.id,
        action: AUDIT_ACTIONS.MEDIA_DELETED,
        entityType: "media",
        entityId: id.data,
      });
      revalidatePath(routes.admin.media);
      return { ok: true, message: "Asset deleted." };

    case "detached":
      return {
        ok: false,
        message: `Still used by ${outcome.remainingReferences} record(s). Detach it there first.`,
      };

    case "storage-failed":
      return { ok: false, message: outcome.message };

    case "missing":
      return { ok: false, message: "That asset no longer exists." };
  }
}

/** Reference count, for the confirmation dialog. */
export async function mediaReferenceCountAction(assetId: string): Promise<number> {
  await requireStaff();
  const id = cuidSchema.safeParse(assetId);
  return id.success ? referenceCount(id.data) : 0;
}
