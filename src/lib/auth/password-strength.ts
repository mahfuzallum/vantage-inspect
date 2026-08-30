/**
 * Client-safe strength signal for the registration meter. Deliberately kept
 * out of ./password, which is server-only because it imports bcrypt.
 *
 * This is feedback, not enforcement — the real rules live in the Zod schema
 * and are checked again on the server.
 */
export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export function passwordStrength(value: string): StrengthScore {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 10) score += 1;
  if (value.length >= 14) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(score, 4) as StrengthScore;
}

export const STRENGTH_LABELS: Record<StrengthScore, string> = {
  0: "Too short",
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Strong",
};
