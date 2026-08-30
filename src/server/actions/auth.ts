"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { db } from "@/lib/db";
import { signIn, signOut } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  revokeResetTokens,
} from "@/lib/auth/tokens";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/validation/auth";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";
import { sendPasswordReset } from "@/lib/email";
import { safeRedirectPath } from "@/lib/security/sanitize";
import { routes } from "@/config/routes";

/**
 * Shared shape for every auth form. `fieldErrors` drives inline messages;
 * `formError` is the single message shown above the form.
 */
import type { AuthFormState } from "./auth-state";

function fieldErrorsFrom(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const output: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    (output[key] ??= []).push(issue.message);
  }
  return output;
}

async function limitOrFail(name: Parameters<typeof rateLimit>[0]): Promise<AuthFormState | null> {
  const limit = await rateLimit(name, clientIdentifier(await headers()));
  if (limit.allowed) return null;

  const minutes = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 60_000));
  return {
    status: "error",
    formError: `Too many attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  };
}

// ---------------------------------------------------------------- login

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    rememberDevice: formData.get("rememberDevice") === "on",
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const limited = await limitOrFail("login");
  if (limited) return limited;

  // Only same-origin relative paths are accepted, so ?callbackUrl= cannot be
  // turned into an open redirect to another site.
  const destination = safeRedirectPath(
    formData.get("callbackUrl")?.toString(),
    routes.account.root,
  );

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      remember: parsed.data.rememberDevice ? "true" : "false",
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Deliberately identical whether the address is unknown or the password
      // is wrong — anything more specific is an account-enumeration oracle.
      return { status: "error", formError: "That email and password don't match." };
    }
    throw error;
  }

  redirect(destination);
}

// ---------------------------------------------------------------- register

export async function registerAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptTerms: formData.get("acceptTerms") === "on",
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const limited = await limitOrFail("register");
  if (limited) return limited;

  const { email, username, displayName, password } = parsed.data;

  try {
    const existing = await db.user.findFirst({
      where: { OR: [{ email }, { username: username.toLowerCase() }] },
      select: { email: true, username: true },
    });

    if (existing) {
      // A username clash is safe to name — usernames are public. An email
      // clash is not, so it is reported against the username-neutral form.
      if (existing.username === username.toLowerCase()) {
        return { status: "error", fieldErrors: { username: ["That username is taken."] } };
      }
      return {
        status: "error",
        formError:
          "That account could not be created. If you already have one, try signing in or resetting your password.",
      };
    }

    await db.user.create({
      data: {
        email,
        username: username.toLowerCase(),
        displayName,
        passwordHash: await hashPassword(password),
        preference: { create: {} },
      },
    });
  } catch (error) {
    console.error("[auth] registration failed:", error);
    return { status: "error", formError: "Something went wrong. Try again." };
  }

  // Sign straight in, so registration does not end on a second form.
  try {
    await signIn("credentials", {
      email,
      password,
      remember: "true",
      redirect: false,
    });
  } catch {
    redirect(routes.auth.login);
  }

  redirect(routes.account.root);
}

// ---------------------------------------------------------------- reset

export async function forgotPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const limited = await limitOrFail("passwordReset");
  if (limited) return limited;

  try {
    const user = await db.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, isActive: true },
    });

    if (user?.isActive) {
      const token = await createPasswordResetToken(user.id);

      // Delivery outcome is deliberately not surfaced. A different response
      // for a failed send would still distinguish a real address from an
      // unknown one, which is exactly what the generic reply below prevents.
      await sendPasswordReset(parsed.data.email, token);
    }
  } catch (error) {
    console.error("[auth] reset request failed:", error);
    // Still fall through to the generic response below.
  }

  // Identical response either way — this must not reveal who has an account.
  return {
    status: "success",
    message:
      "If that address has an account, a reset link is on its way. The link expires in 30 minutes.",
  };
}

export async function resetPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const limited = await limitOrFail("passwordReset");
  if (limited) return limited;

  try {
    // Consuming the token checks existence, expiry and single use at once.
    const userId = await consumePasswordResetToken(parsed.data.token);
    if (!userId) {
      return {
        status: "error",
        formError: "That reset link is invalid or has expired. Request a new one.",
      };
    }

    await db.$transaction([
      db.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(parsed.data.password) },
      }),
      // Every existing session is dropped: a reset is often a response to a
      // compromise, so other devices must not stay signed in.
      db.session.deleteMany({ where: { userId } }),
    ]);

    await revokeResetTokens(userId);
  } catch (error) {
    console.error("[auth] reset failed:", error);
    return { status: "error", formError: "Something went wrong. Try again." };
  }

  return {
    status: "success",
    message: "Your password has been changed. You can sign in with it now.",
  };
}

// ---------------------------------------------------------------- logout

export async function logoutAction(): Promise<void> {
  // Clears the session cookie server-side; hiding the UI is not logging out.
  await signOut({ redirectTo: routes.home });
}

/**
 * Signs in with the administrator unlock code.
 *
 * Rate limited on the same bucket as password sign-in, because it is one:
 * a short secret that grants a session. The code itself is verified inside the
 * `unlock-code` provider, so nothing here can be used to skip that check.
 */
export async function unlockAdminAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const code = String(formData.get("code") ?? "").trim();
  if (code.length < 6) {
    return { status: "error", formError: "That code is not right." };
  }

  const limited = await limitOrFail("login");
  if (limited) return limited;

  try {
    await signIn("unlock-code", { code, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      // Deliberately identical whether the code was wrong or no administrator
      // exists — neither fact should be learnable from the outside.
      return { status: "error", formError: "That code is not right." };
    }
    throw error;
  }

  redirect(routes.admin.root);
}
