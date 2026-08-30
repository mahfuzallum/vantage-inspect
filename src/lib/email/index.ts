import "server-only";
import { sendEmail } from "./providers";
import { emailChangeVerification, passwordResetEmail } from "./templates";
import { absoluteUrl } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";
import type { SendResult } from "./types";

export * from "./types";
export { emailProvider, sendEmail } from "./providers";

const RESET_TTL_MINUTES = 30;
const EMAIL_CHANGE_TTL_MINUTES = 60;

/**
 * Named send operations.
 *
 * Callers pass a token, never a URL — link construction stays here so a reset
 * link can never be pointed at another origin by an upstream mistake.
 */
export async function sendPasswordReset(to: string, rawToken: string): Promise<SendResult> {
  return sendEmail(
    passwordResetEmail(to, absoluteUrl(routes.auth.resetPassword(rawToken)), RESET_TTL_MINUTES),
  );
}

export async function sendEmailVerification(to: string, rawToken: string): Promise<SendResult> {
  return sendEmail(
    emailChangeVerification(
      to,
      absoluteUrl(`/account/settings/confirm-email?token=${encodeURIComponent(rawToken)}`),
      EMAIL_CHANGE_TTL_MINUTES,
    ),
  );
}
