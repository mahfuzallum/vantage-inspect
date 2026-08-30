"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth/guards";
import { cuidSchema } from "@/validation/common";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";
import { logSecurityEvent, logServerError, SECURITY_EVENTS } from "@/lib/security/logger";

/**
 * Discriminated result rather than a thrown error: "you are not signed in" is
 * a normal outcome the button needs to render, not an exception.
 */
export type FavoriteResult =
  | { status: "saved"; saved: true }
  | { status: "removed"; saved: false }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

const inputSchema = z.object({ contentId: cuidSchema });

/**
 * Toggles a saved item.
 *
 * The user id comes from the session on the server — never from the client —
 * so a caller cannot save an item on someone else's behalf by editing a
 * payload. The unique constraint on (userId, contentId) makes a duplicate
 * impossible even if two clicks race.
 */
export async function toggleFavoriteAction(rawContentId: string): Promise<FavoriteResult> {
  const user = await currentUser();
  if (!user) return { status: "unauthenticated" };

  const parsed = inputSchema.safeParse({ contentId: rawContentId });
  if (!parsed.success) return { status: "error", message: "That item could not be found." };

  // Second ceiling behind the unique constraint: stops a loop churning rows.
  const limit = await rateLimit("favorite", clientIdentifier(await headers()));
  if (!limit.allowed) {
    logSecurityEvent(SECURITY_EVENTS.RATE_LIMITED, { action: "favorite", userId: user.id }, "warn");
    return { status: "error", message: "Too many changes just now. Try again shortly." };
  }

  const { contentId } = parsed.data;

  try {
    // Confirm the item exists and is public before recording anything against it.
    const content = await db.content.findFirst({
      where: { id: contentId, status: "PUBLISHED" },
      select: { id: true, slug: true },
    });
    if (!content) return { status: "error", message: "That item could not be found." };

    const existing = await db.favorite.findUnique({
      where: { userId_contentId: { userId: user.id, contentId } },
      select: { id: true },
    });

    if (existing) {
      await db.$transaction([
        db.favorite.delete({ where: { id: existing.id } }),
        db.content.update({
          where: { id: contentId },
          data: { favoriteCount: { decrement: 1 } },
        }),
      ]);
      revalidatePath(`/content/${content.slug}`);
      return { status: "removed", saved: false };
    }

    await db.$transaction([
      db.favorite.create({ data: { userId: user.id, contentId } }),
      db.content.update({ where: { id: contentId }, data: { favoriteCount: { increment: 1 } } }),
    ]);
    revalidatePath(`/content/${content.slug}`);
    return { status: "saved", saved: true };
  } catch (error) {
    logServerError("favorites.toggle", error, { userId: user.id });
    return { status: "error", message: "That didn't save. Try again." };
  }
}

/** Whether the signed-in reader has saved an item. False when signed out. */
export async function checkFavoriteStatus(contentId: string): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;

  try {
    const existing = await db.favorite.findUnique({
      where: { userId_contentId: { userId: user.id, contentId } },
      select: { id: true },
    });
    return Boolean(existing);
  } catch {
    return false;
  }
}
