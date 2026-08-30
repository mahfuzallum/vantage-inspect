import "server-only";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { randomToken, sha256 } from "@/lib/utils/hash";

/**
 * Account-level reads and writes.
 *
 * Every function here takes a `userId` that the caller has already derived
 * from the server session. Nothing in this file accepts an identity from the
 * client, so there is no path by which one reader can act on another's data.
 */

export type AccountSummary = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  emailVerifiedAt: Date | null;
  favoriteCount: number;
  historyCount: number;
};

/** Profile plus the two counts the dashboard shows. One round trip each. */
export async function getAccountSummary(userId: string): Promise<AccountSummary | null> {
  const [user, favoriteCount, historyCount] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        createdAt: true,
        lastLoginAt: true,
        emailVerifiedAt: true,
      },
    }),
    db.favorite.count({ where: { userId } }),
    db.viewingHistory.count({ where: { userId } }),
  ]);

  return user ? { ...user, favoriteCount, historyCount } : null;
}

export type ProfileUpdate = { displayName: string; username: string; bio?: string | null };

/** Returns false when the username is already taken by someone else. */
export async function updateProfile(userId: string, data: ProfileUpdate): Promise<boolean> {
  const username = data.username.toLowerCase();

  const clash = await db.user.findFirst({
    where: { username, id: { not: userId } },
    select: { id: true },
  });
  if (clash) return false;

  await db.user.update({
    where: { id: userId },
    data: {
      displayName: data.displayName,
      username,
      bio: data.bio?.trim() || null,
    },
  });
  return true;
}

export async function updatePreferences(
  userId: string,
  data: {
    autoplay: boolean;
    keepHistory: boolean;
    itemsPerPage: number;
    emailNotifications: boolean;
  },
): Promise<void> {
  await db.userPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

export async function getPreferences(userId: string) {
  return db.userPreference.findUnique({ where: { userId } });
}

export type PasswordChangeResult = "ok" | "wrong-password" | "no-password-set";

/**
 * Changes a password after re-verifying the current one.
 *
 * On success every persisted session row for the user is dropped. With the
 * JWT strategy the active cookie is not self-invalidating, so the caller is
 * expected to sign the reader out and have them log back in — see the
 * settings action.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<PasswordChangeResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) return "wrong-password";
  if (!user.passwordHash) return "no-password-set";

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return "wrong-password";

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    // Any other device holding a session is cut off.
    db.session.deleteMany({ where: { userId } }),
    db.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  return "ok";
}

export async function verifyCurrentPassword(userId: string, password: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  return verifyPassword(password, user?.passwordHash ?? null);
}

// ---------------------------------------------------------------- email change

const EMAIL_TOKEN_TTL_MINUTES = 60;

export type EmailChangeRequest = {
  /** Raw token for the confirmation link. Never persisted in this form. */
  token: string;
  newEmail: string;
};

/**
 * Starts an email change.
 *
 * The new address is parked in `email_change_tokens` and is NOT written to the
 * user row until the link is confirmed — so an unverified or mistyped address
 * can never lock someone out of their account.
 *
 * PENDING INTEGRATION: no mail transport is configured yet, so nothing is
 * actually delivered. The caller is responsible for saying so plainly rather
 * than claiming an email was sent.
 */
export async function requestEmailChange(
  userId: string,
  newEmail: string,
): Promise<EmailChangeRequest | "taken"> {
  const normalized = newEmail.toLowerCase();

  const existing = await db.user.findFirst({
    where: { email: normalized },
    select: { id: true },
  });
  if (existing) return "taken";

  // Supersede any earlier pending request.
  await db.emailChangeToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomToken(32);
  await db.emailChangeToken.create({
    data: {
      userId,
      newEmail: normalized,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MINUTES * 60_000),
    },
  });

  return { token, newEmail: normalized };
}

/** Confirms a pending change. Returns the new address, or null if invalid. */
export async function confirmEmailChange(rawToken: string): Promise<string | null> {
  const record = await db.emailChangeToken.findUnique({
    where: { tokenHash: sha256(rawToken) },
    select: { id: true, userId: true, newEmail: true, expiresAt: true, usedAt: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) return null;

  // Re-check at confirmation time: the address may have been claimed since.
  const taken = await db.user.findFirst({
    where: { email: record.newEmail, id: { not: record.userId } },
    select: { id: true },
  });
  if (taken) return null;

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { email: record.newEmail, emailVerifiedAt: new Date() },
    }),
    db.emailChangeToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  return record.newEmail;
}

/** Pending request, so settings can show what is awaiting confirmation. */
export async function pendingEmailChange(userId: string) {
  return db.emailChangeToken.findFirst({
    where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
    select: { newEmail: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
}

// ---------------------------------------------------------------- deletion

/**
 * Deletes an account and everything cascading from it.
 *
 * Requires the password again — a session cookie alone is not enough
 * authorisation for an irreversible action.
 *
 * PENDING INTEGRATION: this is an immediate hard delete. A production archive
 * usually wants a grace period (soft delete, then purge on a schedule) plus an
 * export of the reader's own data first. Neither is built yet.
 */
export async function deleteAccount(userId: string, password: string): Promise<boolean> {
  const ok = await verifyCurrentPassword(userId, password);
  if (!ok) return false;

  // Favourites, history, sessions, tokens and preferences cascade from User.
  // Reports keep a null author so the moderation record survives.
  await db.user.delete({ where: { id: userId } });
  return true;
}
