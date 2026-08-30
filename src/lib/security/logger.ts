import "server-only";

/**
 * Structured server-side logging for security-relevant events.
 *
 * One place that decides what is safe to write down. Secrets are not passed to
 * it and then filtered — the redaction pass below is a backstop for mistakes,
 * not the primary control. Nothing here is ever sent to the browser.
 *
 * Emits single-line JSON so a log shipper can parse it without a custom rule.
 */

export type LogLevel = "info" | "warn" | "error";

export const SECURITY_EVENTS = {
  LOGIN_FAILED: "auth.login_failed",
  LOGIN_SUCCEEDED: "auth.login_succeeded",
  LOGOUT: "auth.logout",
  REGISTER: "auth.register",
  PASSWORD_RESET_REQUESTED: "auth.password_reset_requested",
  PASSWORD_RESET_COMPLETED: "auth.password_reset_completed",
  PASSWORD_CHANGED: "auth.password_changed",
  RATE_LIMITED: "abuse.rate_limited",
  AUTHZ_DENIED: "authz.denied",
  UPLOAD_REJECTED: "media.upload_rejected",
  UPLOAD_ACCEPTED: "media.upload_accepted",
  MEDIA_DELETED: "media.deleted",
  PROCESSING_FAILED: "media.processing_failed",
  ADMIN_ACTION: "admin.action",
  SERVER_ERROR: "server.error",
} as const;

export type SecurityEvent = (typeof SECURITY_EVENTS)[keyof typeof SECURITY_EVENTS];

/** Field names that must never appear in a log line, whatever the caller passes. */
const FORBIDDEN_KEYS = new Set([
  "password",
  "currentpassword",
  "newpassword",
  "confirmpassword",
  "passwordhash",
  "token",
  "tokenhash",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "secret",
  "accesskey",
  "secretkey",
  "authorization",
  "cookie",
  "signature",
  "email",
  "ip",
  "ipaddress",
]);

/** Values that look like a credential even under an innocent key name. */
function looksSensitive(value: string): boolean {
  if (value.startsWith("$2a$") || value.startsWith("$2b$")) return true; // bcrypt
  if (/^eyJ[A-Za-z0-9_-]{10,}\./.test(value)) return true; // JWT
  if (/^(AKIA|ASIA)[A-Z0-9]{16}$/.test(value)) return true; // AWS key id
  // A long unbroken high-entropy string is more likely a secret than prose.
  return value.length > 60 && !/\s/.test(value);
}

/**
 * Strips anything that must not be persisted. Applied to every log call as a
 * safety net — a future contributor logging a whole request body should not be
 * able to leak a password through this module.
 */
export function redact(input: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth-limit]";
  if (input === null || input === undefined) return input;

  if (typeof input === "string") {
    return looksSensitive(input) ? "[redacted]" : input.slice(0, 500);
  }
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (input instanceof Date) return input.toISOString();
  if (Array.isArray(input)) return input.slice(0, 20).map((item) => redact(item, depth + 1));

  if (typeof input === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      output[key] = FORBIDDEN_KEYS.has(key.toLowerCase()) ? "[redacted]" : redact(value, depth + 1);
    }
    return output;
  }

  return "[unloggable]";
}

function write(level: LogLevel, event: string, context: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(redact(context) as Record<string, unknown>),
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/**
 * Records a security-relevant event.
 *
 * `userId` is included deliberately — attributing an action to an account is
 * the point of an audit trail — but no email, IP or token accompanies it.
 */
export function logSecurityEvent(
  event: SecurityEvent,
  context: Record<string, unknown> = {},
  level: LogLevel = "info",
): void {
  write(level, event, context);
}

/**
 * Logs a caught error without leaking its internals to the caller.
 *
 * The stack is written server-side only in development; in production just the
 * message and a correlation id are kept, so a log aggregator never becomes a
 * place file paths and query text accumulate.
 */
export function logServerError(
  scope: string,
  error: unknown,
  context: Record<string, unknown> = {},
): string {
  const correlationId = Math.random().toString(36).slice(2, 10);
  const message = error instanceof Error ? error.message : String(error);

  write("error", SECURITY_EVENTS.SERVER_ERROR, {
    scope,
    correlationId,
    message: message.slice(0, 500),
    ...(process.env.NODE_ENV === "development" && error instanceof Error
      ? { stack: error.stack?.split("\n").slice(0, 5).join("\n") }
      : {}),
    ...context,
  });

  // Returned so a response can reference the incident without exposing detail.
  return correlationId;
}
