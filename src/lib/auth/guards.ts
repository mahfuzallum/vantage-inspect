import "server-only";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "./index";
import { loginWithCallback, routes } from "@/config/routes";
import { forbidden, unauthorized } from "@/lib/api/errors";

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  name: string | null;
  image: string | null;
  role: UserRole;
};

/** Raw session, for callers that need more than the user shape. */
export async function getCurrentSession() {
  return auth();
}

/** Alias kept for readability at call sites that read as a question. */
export const getCurrentUser = () => currentUser();

/** Current user, or null. Safe to call from any Server Component. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    username: session.user.username ?? "",
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    role: session.user.role ?? "USER",
  };
}

/** Page-level guard: redirects to sign-in, preserving the intended path. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) {
    redirect(returnTo ? loginWithCallback(returnTo) : routes.auth.login);
  }
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(routes.home);
  return user;
}

/** Route-handler guard: throws ApiError instead of redirecting. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requireApiRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireApiUser();
  if (!roles.includes(user.role)) throw forbidden();
  return user;
}

export { isStaff, isAdmin } from "./roles";

/**
 * Admin-only page guard. MODERATOR is deliberately excluded: destructive and
 * configuration operations belong to ADMIN alone.
 */
export async function requireAdmin(): Promise<SessionUser> {
  return requireRole("ADMIN");
}

/** Staff guard — ADMIN or MODERATOR. Most admin reads use this. */
export async function requireStaff(): Promise<SessionUser> {
  return requireRole("ADMIN", "MODERATOR");
}

/** Current user if they are staff, otherwise null. Never throws. */
export async function getCurrentAdmin(): Promise<SessionUser | null> {
  const user = await currentUser();
  if (!user) return null;
  return user.role === "ADMIN" || user.role === "MODERATOR" ? user : null;
}
