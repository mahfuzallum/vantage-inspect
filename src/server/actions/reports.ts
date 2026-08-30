"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth/guards";
import { reportSchema } from "@/validation/content";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";

export type ReportResult = { status: "sent" } | { status: "error"; message: string };

/**
 * Files a report against a record. Open to signed-out readers — a broken file
 * is worth hearing about regardless — but rate limited per client so the queue
 * cannot be flooded.
 */
export async function submitReportAction(input: {
  targetId: string;
  reason: string;
  message?: string;
}): Promise<ReportResult> {
  const parsed = reportSchema.safeParse({ ...input, targetType: "CONTENT" });
  if (!parsed.success) {
    return { status: "error", message: "Pick a reason before sending." };
  }

  try {
    const limit = await rateLimit("report", clientIdentifier(await headers()));
    if (!limit.allowed) {
      return { status: "error", message: "Too many reports just now. Try again later." };
    }

    const user = await currentUser();
    await db.report.create({
      data: {
        targetType: "CONTENT",
        targetId: parsed.data.targetId,
        reason: parsed.data.reason,
        message: parsed.data.message ?? null,
        authorId: user?.id ?? null,
      },
    });

    return { status: "sent" };
  } catch (error) {
    console.error("[reports] submit failed:", error);
    return { status: "error", message: "That didn't send. Try again." };
  }
}
