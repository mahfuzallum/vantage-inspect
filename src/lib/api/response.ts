import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "./errors";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; details?: Record<string, string[]> };
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data }, init);
}

export function fail(error: ApiError) {
  return NextResponse.json<ApiFailure>(
    { ok: false, error: { code: error.code, message: error.message, details: error.details } },
    { status: error.status },
  );
}

/**
 * Converts anything thrown inside a route handler into a safe response.
 * Internal error text is logged, never returned to the client.
 */
export function handleRouteError(error: unknown) {
  if (error instanceof ApiError) return fail(error);

  if (error instanceof z.ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_";
      (details[key] ??= []).push(issue.message);
    }
    return fail(new ApiError("BAD_REQUEST", "Check the highlighted fields.", details));
  }

  console.error("[api] unhandled error:", error);

  /*
    In development the real message goes to the caller as well as the log.
    "Something went wrong" is the right answer to a stranger on the internet,
    but the only person hitting this locally is the developer who started the
    server, and sending them to hunt through a terminal for a message we
    already hold helps nobody.
  */
  if (process.env.NODE_ENV === "development" && error instanceof Error) {
    return fail(new ApiError("INTERNAL", error.message));
  }

  return fail(new ApiError("INTERNAL", "Something went wrong. Try again."));
}

export function rateLimitedResponse(resetAt: number) {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json<ApiFailure>(
    {
      ok: false,
      error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." },
    },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
