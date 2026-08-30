"use server";

import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth/guards";
import { randomToken } from "@/lib/utils/hash";
import { recordView } from "@/server/services/view-service";
import { recordViewingHistory } from "@/server/services/library-service";
import { cuidSchema } from "@/validation/common";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";
import { logServerError } from "@/lib/security/logger";

const VIEW_COOKIE = "vantage.vk";
const COOKIE_MAX_AGE_DAYS = 30;

/**
 * Opaque per-browser key for attributing anonymous views. It identifies a
 * browser for de-duplication only — it is not linked to an account, carries no
 * personal data, and no IP address is stored alongside it.
 */
async function viewerKey(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VIEW_COOKIE)?.value;
  if (existing) return existing;

  const fresh = randomToken(16);
  jar.set(VIEW_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
  });
  return fresh;
}

/**
 * Records one view.
 *
 * Called from the client when playback actually starts, not on mount, so a
 * render or a bounce does not inflate the count. The service de-duplicates the
 * same viewer on the same item within 30 minutes.
 *
 * Deliberately fire-and-forget: a tracking failure must never break the page,
 * so every error is swallowed after logging.
 */
export async function recordContentView(rawContentId: string): Promise<void> {
  const parsed = cuidSchema.safeParse(rawContentId);
  if (!parsed.success) return;

  try {
    // Ceiling against a client firing this in a loop. The service also
    // de-duplicates per viewer for 30 minutes, so this rarely triggers.
    const limit = await rateLimit("viewTracking", clientIdentifier(await headers()));
    if (!limit.allowed) return;

    // Only count views against content that exists and is published.
    const content = await db.content.findFirst({
      where: { id: parsed.data, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!content) return;

    const user = await currentUser();
    await recordView({
      contentId: content.id,
      userId: user?.id ?? null,
      sessionKey: user ? null : await viewerKey(),
    });

    // Signed-in readers also get a history entry. The service respects their
    // keepHistory preference and swallows its own failures, so this can never
    // take the page down with it.
    if (user) await recordViewingHistory(user.id, content.id);
  } catch (error) {
    // Analytics is secondary to content delivery: log and move on.
    logServerError("views.record", error);
  }
}
