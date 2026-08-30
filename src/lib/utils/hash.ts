import { createHash, randomBytes } from "node:crypto";

/**
 * One-way hash for values we need to compare but must not be able to read
 * back: IP addresses, user agents, password-reset tokens.
 */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Salted IP hash — the salt keeps hashes non-reversible via rainbow table. */
export function hashIp(ip: string | null | undefined, salt: string): string | null {
  if (!ip) return null;
  return sha256(`${salt}:${ip}`);
}

/** URL-safe random token for password resets and anonymous session keys. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
