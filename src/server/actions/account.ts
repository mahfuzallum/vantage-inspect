"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentUser } from "@/lib/auth/guards";
import { signOut } from "@/lib/auth";
import {
  changePassword,
  deleteAccount,
  requestEmailChange,
  updatePreferences,
  updateProfile,
} from "@/server/services/account-service";
import {
  clearViewingHistory,
  removeHistoryItem,
  toggleFavorite,
} from "@/server/services/library-service";
import { updatePreferencesSchema, updateProfileSchema } from "@/validation/account";
import { changePasswordSchema } from "@/validation/auth";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";
import { cuidSchema } from "@/validation/common";
import { routes } from "@/config/routes";
import { sendEmailVerification } from "@/lib/email";
import type { AuthFormState } from "./auth-state";

function fieldErrorsFrom(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const output: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    (output[key] ??= []).push(issue.message);
  }
  return output;
}

/**
 * Every action below resolves the acting user from the session on the server.
 * No action accepts a user id from the client, so a forged payload can only
 * ever affect the caller's own data.
 */
async function requireActor() {
  const user = await currentUser();
  if (!user) redirect(routes.auth.login);
  return user;
}

// ---------------------------------------------------------------- profile

export async function updateProfileAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await requireActor();

  const parsed = updateProfileSchema
    .extend({ bio: z.string().trim().max(500).optional() })
    .safeParse({
      displayName: formData.get("displayName"),
      username: formData.get("username"),
      bio: formData.get("bio") ?? undefined,
    });

  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    const ok = await updateProfile(user.id, parsed.data);
    if (!ok) {
      return { status: "error", fieldErrors: { username: ["That username is taken."] } };
    }
  } catch (error) {
    console.error("[account] profile update failed:", error);
    return { status: "error", formError: "That didn't save. Try again." };
  }

  revalidatePath(routes.account.settings);
  revalidatePath(routes.account.root);
  return { status: "success", message: "Profile updated." };
}

export async function updatePreferencesAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await requireActor();

  const parsed = updatePreferencesSchema.safeParse({
    autoplay: formData.get("autoplay") === "on",
    keepHistory: formData.get("keepHistory") === "on",
    emailNotifications: formData.get("emailNotifications") === "on",
    itemsPerPage: formData.get("itemsPerPage") ?? undefined,
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    await updatePreferences(user.id, {
      autoplay: parsed.data.autoplay,
      keepHistory: parsed.data.keepHistory,
      itemsPerPage: parsed.data.itemsPerPage,
      emailNotifications: parsed.data.emailNotifications,
    });
  } catch (error) {
    console.error("[account] preferences update failed:", error);
    return { status: "error", formError: "That didn't save. Try again." };
  }

  revalidatePath(routes.account.settings);
  return { status: "success", message: "Preferences saved." };
}

// ---------------------------------------------------------------- password

export async function changePasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await requireActor();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const limit = await rateLimit("passwordChange", clientIdentifier(await headers()));
  if (!limit.allowed) {
    return { status: "error", formError: "Too many attempts. Try again shortly." };
  }

  try {
    const result = await changePassword(user.id, parsed.data.currentPassword, parsed.data.password);

    if (result === "wrong-password") {
      return {
        status: "error",
        fieldErrors: { currentPassword: ["That isn't your current password."] },
      };
    }
    if (result === "no-password-set") {
      return {
        status: "error",
        formError: "This account signs in without a password. Use the reset flow instead.",
      };
    }
  } catch (error) {
    console.error("[account] password change failed:", error);
    return { status: "error", formError: "That didn't save. Try again." };
  }

  // Other devices were cut off server-side; sign this one out too so the new
  // password is what gets used from here on.
  await signOut({ redirectTo: `${routes.auth.login}?passwordChanged=1` });
  return { status: "success", message: "Password changed." };
}

// ---------------------------------------------------------------- email

export async function requestEmailChangeAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await requireActor();

  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.") })
    .safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const limit = await rateLimit("emailChange", clientIdentifier(await headers()));
  if (!limit.allowed) {
    return { status: "error", formError: "Too many requests. Try again later." };
  }

  let delivery: Awaited<ReturnType<typeof sendEmailVerification>> | null = null;

  try {
    const result = await requestEmailChange(user.id, parsed.data.email);

    if (result === "taken") {
      // Same wording as success would be ideal, but the reader is already
      // authenticated here, so there is no enumeration risk in being useful.
      return { status: "error", fieldErrors: { email: ["That address is already in use."] } };
    }

    // Sent to the NEW address: confirming it is what proves the reader
    // controls it. The account keeps its current address until then.
    delivery = await sendEmailVerification(result.newEmail, result.token);
  } catch (error) {
    console.error("[account] email change failed:", error);
    return { status: "error", formError: "That didn't send. Try again." };
  }

  revalidatePath(routes.account.settings);

  // Say what actually happened. If the transport skipped delivery, the reader
  // is told so rather than left waiting for a message that is not coming.
  const delivered = delivery?.status === "sent";
  return {
    status: "success",
    message: delivered
      ? "Confirmation sent to the new address. Your account keeps its current address until that link is used."
      : "Change requested, but no email could be sent — mail delivery is not configured on this instance. Your address is unchanged.",
  };
}

// ---------------------------------------------------------------- library

export async function removeFavoriteAction(contentId: string): Promise<void> {
  const user = await requireActor();

  const parsed = cuidSchema.safeParse(contentId);
  if (!parsed.success) return;

  try {
    await toggleFavorite(user.id, parsed.data);
  } catch (error) {
    console.error("[account] remove favourite failed:", error);
  }

  revalidatePath(routes.account.favorites);
}

export async function removeHistoryItemAction(contentId: string): Promise<void> {
  const user = await requireActor();

  const parsed = cuidSchema.safeParse(contentId);
  if (!parsed.success) return;

  try {
    // Scoped by userId inside the query, so this cannot touch another reader's row.
    await removeHistoryItem(user.id, parsed.data);
  } catch (error) {
    console.error("[account] remove history item failed:", error);
  }

  revalidatePath(routes.account.history);
}

export async function clearHistoryAction(): Promise<void> {
  const user = await requireActor();

  try {
    await clearViewingHistory(user.id);
  } catch (error) {
    console.error("[account] clear history failed:", error);
  }

  revalidatePath(routes.account.history);
}

// ---------------------------------------------------------------- deletion

export async function deleteAccountAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await requireActor();

  const parsed = z
    .object({
      password: z.string().min(1, "Enter your password to confirm."),
      confirmation: z.literal("DELETE", {
        message: "Type DELETE exactly to confirm.",
      }),
    })
    .safeParse({
      password: formData.get("password"),
      confirmation: formData.get("confirmation"),
    });

  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const limit = await rateLimit("accountDelete", clientIdentifier(await headers()));
  if (!limit.allowed) {
    return { status: "error", formError: "Too many attempts. Try again later." };
  }

  try {
    // Re-authentication: a session cookie alone is not enough for something
    // irreversible.
    const ok = await deleteAccount(user.id, parsed.data.password);
    if (!ok) {
      return { status: "error", fieldErrors: { password: ["That password is not correct."] } };
    }
  } catch (error) {
    console.error("[account] deletion failed:", error);
    return { status: "error", formError: "That didn't complete. Try again." };
  }

  await signOut({ redirectTo: routes.home });
  return { status: "success" };
}
