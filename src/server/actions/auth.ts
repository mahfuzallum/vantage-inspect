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
import {
  clientIdentifier,
  rateLimit,
} from "@/lib/security/rate-limit";
import { sendPasswordReset } from "@/lib/email";
import { safeRedirectPath } from "@/lib/security/sanitize";
import { routes } from "@/config/routes";
import type { AuthFormState } from "./auth-state";

/**
 * Shared shape for every auth form. `fieldErrors` drives inline messages;
 * `formError` is the single message shown above the form.
 */

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

async function limitOrFail(
  name: Parameters<typeof rateLimit>[0],
): Promise<AuthFormState | null> {
  const limit = await rateLimit(
    name,
    clientIdentifier(await headers()),
  );

  if (limit.allowed) {
    return null;
  }

  const minutes = Math.max(
    1,
    Math.ceil(
      (limit.resetAt - Date.now()) /
        60_000,
    ),
  );

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
  const parsed =
    loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      rememberDevice:
        formData.get("rememberDevice") ===
        "on",
    });

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors:
        fieldErrorsFrom(parsed.error),
    };
  }

  const limited =
    await limitOrFail("login");

  if (limited) {
    return limited;
  }

  const destination =
    safeRedirectPath(
      formData
        .get("callbackUrl")
        ?.toString(),
      routes.account.root,
    );

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      remember:
        parsed.data.rememberDevice
          ? "true"
          : "false",
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        status: "error",
        formError:
          "That email and password don't match.",
      };
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
  const parsed =
    registerSchema.safeParse({
      email: formData.get("email"),
      username: formData.get("username"),
      displayName:
        formData.get("displayName"),
      password: formData.get("password"),
      confirmPassword:
        formData.get("confirmPassword"),
      acceptTerms:
        formData.get("acceptTerms") ===
        "on",
    });

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors:
        fieldErrorsFrom(parsed.error),
    };
  }

  const limited =
    await limitOrFail("register");

  if (limited) {
    return limited;
  }

  const {
    email,
    username,
    displayName,
    password,
  } = parsed.data;

  try {
    const existing =
      await db.user.findFirst({
        where: {
          OR: [
            { email },
            {
              username:
                username.toLowerCase(),
            },
          ],
        },
        select: {
          email: true,
          username: true,
        },
      });

    if (existing) {
      if (
        existing.username ===
        username.toLowerCase()
      ) {
        return {
          status: "error",
          fieldErrors: {
            username: [
              "That username is taken.",
            ],
          },
        };
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
        username:
          username.toLowerCase(),
        displayName,
        passwordHash:
          await hashPassword(password),
        preference: {
          create: {},
        },
      },
    });
  } catch (error) {
    console.error(
      "[auth] registration failed:",
      error,
    );

    return {
      status: "error",
      formError:
        "Something went wrong. Try again.",
    };
  }

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
  const parsed =
    forgotPasswordSchema.safeParse({
      email: formData.get("email"),
    });

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors:
        fieldErrorsFrom(parsed.error),
    };
  }

  const limited =
    await limitOrFail("passwordReset");

  if (limited) {
    return limited;
  }

  try {
    const user =
      await db.user.findUnique({
        where: {
          email: parsed.data.email,
        },
        select: {
          id: true,
          isActive: true,
        },
      });

    if (user?.isActive) {
      const token =
        await createPasswordResetToken(
          user.id,
        );

      await sendPasswordReset(
        parsed.data.email,
        token,
      );
    }
  } catch (error) {
    console.error(
      "[auth] reset request failed:",
      error,
    );
  }

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
  const parsed =
    resetPasswordSchema.safeParse({
      token: formData.get("token"),
      password: formData.get("password"),
      confirmPassword:
        formData.get("confirmPassword"),
    });

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors:
        fieldErrorsFrom(parsed.error),
    };
  }

  const limited =
    await limitOrFail("passwordReset");

  if (limited) {
    return limited;
  }

  try {
    const userId =
      await consumePasswordResetToken(
        parsed.data.token,
      );

    if (!userId) {
      return {
        status: "error",
        formError:
          "That reset link is invalid or has expired. Request a new one.",
      };
    }

    await db.$transaction([
      db.user.update({
        where: {
          id: userId,
        },
        data: {
          passwordHash:
            await hashPassword(
              parsed.data.password,
            ),
        },
      }),

      db.session.deleteMany({
        where: {
          userId,
        },
      }),
    ]);

    await revokeResetTokens(
      userId,
    );
  } catch (error) {
    console.error(
      "[auth] reset failed:",
      error,
    );

    return {
      status: "error",
      formError:
        "Something went wrong. Try again.",
    };
  }

  return {
    status: "success",
    message:
      "Your password has been changed. You can sign in with it now.",
  };
}

// ---------------------------------------------------------------- logout

export async function logoutAction(): Promise<void> {
  await signOut({
    redirectTo: routes.home,
  });
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
  const code = String(
    formData.get("code") ?? "",
  ).trim();

  if (code.length < 6) {
    return {
      status: "error",
      formError: "That code is not right.",
    };
  }

  const limited =
    await limitOrFail("login");

  if (limited) {
    return limited;
  }

  try {
    await signIn("unlock-code", {
      code,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        status: "error",
        formError: "That code is not right.",
      };
    }

    throw error;
  }

  redirect(routes.admin.root);
}