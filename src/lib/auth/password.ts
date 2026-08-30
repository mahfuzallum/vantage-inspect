import "server-only";
import bcrypt from "bcryptjs";

/**
 * Cost 12 is the current sensible balance: ~250ms on modern server CPUs.
 * Raise it, never lower it — existing hashes carry their own cost factor.
 */
const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

/**
 * A real bcrypt hash of a random string, at the same cost as live hashes.
 *
 * When an account has no password — or does not exist — the comparison runs
 * against this instead of returning early. An invalid placeholder would make
 * bcrypt bail immediately, and the difference between a ~250ms compare and a
 * ~0ms one is a reliable signal for whether an address is registered.
 */
const DECOY_HASH = "$2b$12$43Yb03yGdQ5P1aP/6OlT0ef1zId4YwqaEVAFWuwK4m7U1AN88eCJO";

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  // Always do the work, so response time does not reveal which emails exist.
  const matches = await bcrypt.compare(plain, hash ?? DECOY_HASH);
  return hash ? matches : false;
}

// Strength feedback lives in ./password-strength so client forms can use it
// without pulling bcrypt into the browser bundle.
export { passwordStrength } from "./password-strength";
