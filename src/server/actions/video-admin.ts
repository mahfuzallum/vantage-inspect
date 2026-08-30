"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { enqueueVideoProcessing } from "@/server/video/queue";
import { cuidSchema } from "@/validation/common";
import { routes } from "@/config/routes";

export type AdminActionResult = { ok: boolean; message: string };

/**
 * Re-queues a failed transcode.
 *
 * Enqueue is idempotent per recording, so this reuses the existing content
 * record and never creates a duplicate. Role is checked server-side.
 */
export async function retryProcessingAction(contentId: string): Promise<AdminActionResult> {
  await requireRole("ADMIN", "MODERATOR");

  const parsed = cuidSchema.safeParse(contentId);
  if (!parsed.success) return { ok: false, message: "Unknown recording." };

  try {
    const content = await db.content.findUnique({
      where: { id: parsed.data },
      select: { id: true, sourceId: true },
    });
    if (!content) return { ok: false, message: "Unknown recording." };
    if (!content.sourceId) {
      return { ok: false, message: "No source file is attached, so there is nothing to process." };
    }

    await db.content.update({
      where: { id: content.id },
      data: { processingStatus: "QUEUED", processingError: null },
    });
    await enqueueVideoProcessing(content.id);
  } catch (error) {
    console.error("[admin] retry failed:", error);
    return { ok: false, message: "Could not queue the job. Try again." };
  }

  revalidatePath(routes.admin.content);
  return { ok: true, message: "Queued for reprocessing." };
}
