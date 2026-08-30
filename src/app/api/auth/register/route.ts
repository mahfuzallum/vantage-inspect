import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { registerSchema } from "@/validation/auth";
import { ApiError } from "@/lib/api/errors";
import { handleRouteError, ok, rateLimitedResponse } from "@/lib/api/response";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";

/**
 * Creates an account. Deliberately vague on conflicts: the response does not
 * reveal whether it was the email or the username that was already taken,
 * and never confirms that a given address is registered.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await rateLimit("register", clientIdentifier(request.headers));
    if (!limit.allowed) return rateLimitedResponse(limit.resetAt);

    const payload = registerSchema.parse(await request.json());

    const existing = await db.user.findFirst({
      where: {
        OR: [{ email: payload.email }, { username: payload.username.toLowerCase() }],
      },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError("CONFLICT", "That email or username is already in use.");
    }

    const user = await db.user.create({
      data: {
        email: payload.email,
        username: payload.username.toLowerCase(),
        displayName: payload.displayName,
        passwordHash: await hashPassword(payload.password),
        preference: { create: {} },
      },
      select: { id: true, username: true },
    });

    return ok({ id: user.id, username: user.username }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
