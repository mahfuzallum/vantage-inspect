import type { UserRole } from "@prisma/client";

/**
 * Role predicates. Kept out of guards.ts (which is server-only) so Client
 * Components can use them without pulling server code into the bundle.
 */
export const isStaff = (role: UserRole | undefined): boolean =>
  role === "ADMIN" || role === "MODERATOR";

export const isAdmin = (role: UserRole | undefined): boolean => role === "ADMIN";
