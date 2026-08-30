import { siteConfig } from "@/config/site";
import { escapeHtml } from "@/lib/security/sanitize";
import type { EmailMessage } from "./types";

/**
 * Message bodies.
 *
 * Plain text is authored first and HTML mirrors it — a mail client that
 * refuses HTML still gets a usable message. Every interpolated value is
 * escaped before it reaches the HTML body, since a display name is
 * user-controlled.
 */

function wrap(title: string, bodyHtml: string): string {
  // Inline styles only: mail clients strip <style> blocks unpredictably.
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#0c0d10;color:#edeff2;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
<div style="max-width:520px;margin:0 auto;background:#14161a;border:1px solid #262a31;border-radius:12px;padding:28px;">
<div style="display:inline-block;width:4px;height:20px;background:#d9a441;border-radius:2px;vertical-align:middle;"></div>
<span style="font-size:16px;font-weight:600;margin-left:8px;vertical-align:middle;">${escapeHtml(siteConfig.name)}</span>
<h1 style="font-size:20px;margin:20px 0 12px;">${escapeHtml(title)}</h1>
${bodyHtml}
<p style="margin-top:24px;padding-top:16px;border-top:1px solid #262a31;color:#8b93a1;font-size:13px;">
If you weren't expecting this message you can ignore it. Nothing changes unless the link above is used.
</p></div></body></html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:20px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#d9a441;color:#1a1204;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:8px;">${escapeHtml(label)}</a></p>
<p style="color:#8b93a1;font-size:13px;word-break:break-all;">Or paste this into your browser:<br>${escapeHtml(url)}</p>`;
}

export function passwordResetEmail(to: string, resetUrl: string, minutes: number): EmailMessage {
  return {
    to,
    subject: `Reset your ${siteConfig.name} password`,
    text: [
      `Someone asked to reset the password for this address on ${siteConfig.name}.`,
      "",
      `Open this link to choose a new one. It expires in ${minutes} minutes and works once:`,
      resetUrl,
      "",
      "If you weren't expecting this, ignore it — your password stays as it is.",
    ].join("\n"),
    html: wrap(
      "Reset your password",
      `<p style="color:#8b93a1;line-height:1.6;">Open the link below to choose a new password. It expires in ${minutes} minutes and can only be used once.</p>${button(resetUrl, "Choose a new password")}`,
    ),
  };
}

export function emailChangeVerification(
  to: string,
  confirmUrl: string,
  minutes: number,
): EmailMessage {
  return {
    to,
    subject: `Confirm your new ${siteConfig.name} address`,
    text: [
      `Confirm this address to finish changing the email on your ${siteConfig.name} account.`,
      "",
      `This link expires in ${minutes} minutes and works once:`,
      confirmUrl,
      "",
      "Your account keeps its current address until this link is used.",
    ].join("\n"),
    html: wrap(
      "Confirm your new address",
      `<p style="color:#8b93a1;line-height:1.6;">Your account keeps its current address until this link is used. It expires in ${minutes} minutes.</p>${button(confirmUrl, "Confirm this address")}`,
    ),
  };
}
