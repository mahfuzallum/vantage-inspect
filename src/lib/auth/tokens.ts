import "server-only";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/utils/hash";

const RESET_TTL_MINUTES = 30;

/**
 * Issues a password-reset token. The raw value is returned once, for the
 * email link; only its hash is persisted.
 */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const raw = randomToken(32);
  await db.passwordResetToken.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
    },
  });
  return raw;
}

/** Returns the owning user id if the token is valid and unused. */
export async function consumePasswordResetToken(raw: string): Promise<string | null> {
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: sha256(raw) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) return null;

  await db.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  return record.userId;
}

/** Invalidate every outstanding token, e.g. after a successful reset. */
export async function revokeResetTokens(userId: string): Promise<void> {
  await db.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
}
