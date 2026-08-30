import "server-only";
import { serverEnv } from "@/lib/env";
import { logSecurityEvent, SECURITY_EVENTS } from "@/lib/security/logger";
import type { EmailMessage, EmailProvider, SendResult } from "./types";

/**
 * Concrete transports.
 *
 * Each one is small on purpose: the interface is the contract, and adding a
 * provider means adding a class here and one branch in the factory. No
 * provider SDK is a dependency — Resend and Postmark are plain HTTPS APIs, and
 * pulling in two SDKs to POST some JSON would not earn its bundle.
 */

/**
 * Development transport.
 *
 * Writes the message to the server log instead of delivering it, and reports
 * `skipped` rather than `sent` — the distinction matters, because a caller
 * must never tell a reader an email is on its way when nothing left the
 * building.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly id = "console";
  readonly configured = true;

  async send(message: EmailMessage): Promise<SendResult> {
    console.info(
      [
        "",
        "  ┌─ email (not delivered — EMAIL_PROVIDER=console)",
        `  │ to:      ${message.to}`,
        `  │ subject: ${message.subject}`,
        "  ├─ body",
        ...message.text.split("\n").map((line) => `  │ ${line}`),
        "  └─",
        "",
      ].join("\n"),
    );
    return { status: "skipped", reason: "console transport: nothing was delivered" };
  }
}

/** Resend — https://resend.com/docs/api-reference/emails/send-email */
export class ResendEmailProvider implements EmailProvider {
  readonly id = "resend";
  get configured(): boolean {
    return Boolean(serverEnv().RESEND_API_KEY && serverEnv().EMAIL_FROM);
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const env = serverEnv();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });

    if (!response.ok) {
      // The provider's body can echo the recipient; keep only the status.
      return { status: "failed", reason: `resend responded ${response.status}` };
    }

    const body = (await response.json()) as { id?: string };
    return { status: "sent", id: body.id };
  }
}

/** Postmark — https://postmarkapp.com/developer/api/email-api */
export class PostmarkEmailProvider implements EmailProvider {
  readonly id = "postmark";
  get configured(): boolean {
    return Boolean(serverEnv().POSTMARK_SERVER_TOKEN && serverEnv().EMAIL_FROM);
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const env = serverEnv();
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": env.POSTMARK_SERVER_TOKEN ?? "",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        From: env.EMAIL_FROM,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        ...(message.html ? { HtmlBody: message.html } : {}),
        MessageStream: env.POSTMARK_MESSAGE_STREAM ?? "outbound",
      }),
    });

    if (!response.ok) return { status: "failed", reason: `postmark responded ${response.status}` };
    const body = (await response.json()) as { MessageID?: string };
    return { status: "sent", id: body.MessageID };
  }
}

/**
 * SMTP, and by extension Amazon SES.
 *
 * Not implemented: SMTP needs a socket client (nodemailer), which is a real
 * dependency this project does not currently carry. Declared so the option is
 * visible and the factory can route to it, and it fails loudly rather than
 * silently pretending to deliver. SES also exposes an HTTPS API, which would
 * follow the Resend/Postmark shape above without any new dependency.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly id = "smtp";
  readonly configured = false;

  async send(): Promise<SendResult> {
    return {
      status: "failed",
      reason:
        "SMTP transport is not implemented. Install nodemailer and complete SmtpEmailProvider, or use EMAIL_PROVIDER=resend|postmark.",
    };
  }
}

let cached: EmailProvider | null = null;

/** The transport selected by EMAIL_PROVIDER. Resolved once per process. */
export function emailProvider(): EmailProvider {
  if (cached) return cached;

  switch (serverEnv().EMAIL_PROVIDER) {
    case "resend":
      cached = new ResendEmailProvider();
      break;
    case "postmark":
      cached = new PostmarkEmailProvider();
      break;
    case "smtp":
      cached = new SmtpEmailProvider();
      break;
    default:
      cached = new ConsoleEmailProvider();
  }
  return cached;
}

/**
 * Sends a message and records the outcome.
 *
 * Never throws: a delivery failure must not break the request that triggered
 * it, and — for password resets especially — must not change what the reader
 * is told, since a different response for a failed send would leak which
 * addresses exist.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const provider = emailProvider();

  if (!provider.configured) {
    logSecurityEvent(
      SECURITY_EVENTS.SERVER_ERROR,
      { scope: "email", provider: provider.id, reason: "not configured" },
      "warn",
    );
    return { status: "skipped", reason: `${provider.id} is not configured` };
  }

  try {
    const result = await provider.send(message);
    // Subject and outcome only — never the body or the recipient.
    logSecurityEvent(SECURITY_EVENTS.SERVER_ERROR, {
      scope: "email",
      provider: provider.id,
      subject: message.subject,
      outcome: result.status,
    });
    return result;
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown transport error",
    };
  }
}
