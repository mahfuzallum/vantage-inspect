import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * A single PrismaClient per process. Next.js hot-reloads modules in dev,
 * so the instance is parked on globalThis to avoid exhausting connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/**
 * Wraps a query so a database outage renders an empty state instead of a
 * 500 on non-critical listing sections. Critical paths should not use this.
 */
export async function safeQuery<T, F = T>(
  run: () => Promise<T>,
  // Separate parameter for the fallback: T stays anchored to the query's own
  // return type (a bare `[]` fallback would otherwise infer as never[]), and
  // a widening fallback such as `null` is allowed without a cast.
  fallback: F,
): Promise<T | F> {
  try {
    return await run();
  } catch (error) {
    console.error("[db] query failed, using fallback:", error);
    return fallback;
  }
}
