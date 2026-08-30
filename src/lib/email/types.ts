/**
 * Provider-neutral email contract.
 *
 * The application depends on this interface only, so switching between a
 * console logger, SMTP, Resend, Postmark or SES is a configuration change.
 * Nothing outside `lib/email` knows which one is active.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text is required; HTML is optional and always accompanied by text. */
  text: string;
  html?: string;
};

export type SendResult =
  | { status: "sent"; id?: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export interface EmailProvider {
  readonly id: string;
  /** True when the provider holds enough configuration to actually deliver. */
  readonly configured: boolean;
  send(message: EmailMessage): Promise<SendResult>;
}
