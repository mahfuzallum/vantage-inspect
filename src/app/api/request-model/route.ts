import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRouteError } from "@/lib/api/response";
import { currentUser } from "@/lib/auth/guards";
import {
  clientIdentifier,
  rateLimit,
} from "@/lib/security/rate-limit";
import { rateLimitedResponse } from "@/lib/api/response";

const requestModelSchema = z.object({
  platform: z
    .string()
    .trim()
    .min(1, "Platform is required.")
    .max(50, "Platform is too long."),

  username: z
    .string()
    .trim()
    .min(2, "Model username is too short.")
    .max(100, "Model username is too long."),

  profileUrl: z
    .string()
    .trim()
    .max(500, "Profile URL is too long.")
    .refine(
      (value) =>
        value === "" ||
        /^https?:\/\/[^\s]+$/i.test(value),
      "Enter a valid public profile URL.",
    )
    .optional()
    .nullable(),

  email: z
    .string()
    .trim()
    .max(254, "Email is too long.")
    .refine(
      (value) =>
        value === "" ||
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      "Enter a valid email address.",
    )
    .optional()
    .nullable(),

  message: z
    .string()
    .trim()
    .max(1000, "Message is too long.")
    .optional()
    .nullable(),
});

type RequestModelPayload = z.infer<
  typeof requestModelSchema
>;

function cleanOptional(
  value: string | null | undefined,
): string | null {
  const cleaned = value?.trim() ?? "";
  return cleaned || null;
}

function getRequestOrigin(
  request: NextRequest,
): string {
  const forwardedHost =
    request.headers.get("x-forwarded-host");

  const forwardedProto =
    request.headers.get("x-forwarded-proto");

  if (forwardedHost) {
    return `${forwardedProto ?? "https"}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

type WebhookResponse = {
  ok?: boolean;
  message?: string;
};

export async function POST(
  request: NextRequest,
) {
  try {
    /*
     * Public endpoint, still rate-limited.
     */
    const limit = await rateLimit(
      "api",
      clientIdentifier(request.headers),
    );

    if (!limit.allowed) {
      return rateLimitedResponse(
        limit.resetAt,
      );
    }

    /*
     * Parse JSON body.
     */
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Invalid request. Please try again.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Validate client payload.
     */
    const parsed =
      requestModelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Please check the form and try again.",
        },
        {
          status: 400,
        },
      );
    }

    const payload: RequestModelPayload =
      parsed.data;

    /*
     * Read the authenticated account from the
     * server-side session only.
     */
    const user = await currentUser();

    const isLoggedIn = Boolean(user);

    /*
     * Google Apps Script webhook configuration.
     */
    const webhookUrl =
      process.env.REQUEST_MODEL_WEBHOOK_URL?.trim();

    const webhookSecret =
      process.env.REQUEST_MODEL_WEBHOOK_SECRET?.trim();

    if (!webhookUrl || !webhookSecret) {
      console.error(
        "[request-model] webhook is not configured.",
      );

      return NextResponse.json(
        {
          ok: false,
          message:
            "Request service is temporarily unavailable. Please try again later.",
        },
        {
          status: 503,
        },
      );
    }

    /*
     * Validate the configured webhook URL.
     */
    let parsedWebhookUrl: URL;

    try {
      parsedWebhookUrl = new URL(
        webhookUrl,
      );
    } catch {
      console.error(
        "[request-model] invalid webhook URL.",
      );

      return NextResponse.json(
        {
          ok: false,
          message:
            "Request service is temporarily unavailable. Please try again later.",
        },
        {
          status: 503,
        },
      );
    }

    /*
     * Production must use HTTPS.
     */
    if (
      parsedWebhookUrl.protocol !== "https:" &&
      process.env.NODE_ENV === "production"
    ) {
      console.error(
        "[request-model] production webhook must use HTTPS.",
      );

      return NextResponse.json(
        {
          ok: false,
          message:
            "Request service is temporarily unavailable. Please try again later.",
        },
        {
          status: 503,
        },
      );
    }

    /*
     * Build the server-controlled webhook payload.
     * Account identity comes from the server session.
     */
    const webhookPayload = {
      secret: webhookSecret,

      time: new Date().toISOString(),

      username: payload.username,

      platform: payload.platform,

      profileUrl: cleanOptional(
        payload.profileUrl,
      ),

      email: cleanOptional(
        payload.email,
      ),

      userId: user?.id ?? null,

      accountUsername:
        user?.username ?? null,

      accountEmail:
        user?.email ?? null,

      requestType: isLoggedIn
        ? "Logged-in"
        : "Guest",

      message: cleanOptional(
        payload.message,
      ),

      status: "Pending",

      source: "request-model",

      origin: getRequestOrigin(
        request,
      ),
    };

    /*
     * Protect the upstream request with a timeout.
     */
    const controller =
      new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      10_000,
    );

    let webhookResponse: Response;

    try {
      webhookResponse = await fetch(
        parsedWebhookUrl.toString(),
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
            Accept: "application/json",
          },

          body: JSON.stringify(
            webhookPayload,
          ),

          cache: "no-store",

          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    /*
     * Always consume the upstream response body.
     * Apps Script normally returns JSON from doPost().
     */
    const responseText =
      await webhookResponse.text().catch(
        () => "",
      );

    let webhookData: WebhookResponse = {};

    try {
      webhookData = JSON.parse(
        responseText,
      ) as WebhookResponse;
    } catch {
      webhookData = {};
    }

    /*
     * IMPORTANT:
     * HTTP 200 alone is not enough.
     *
     * Apps Script can return HTTP 200 with:
     * { ok: false, message: "..." }
     *
     * That must still count as a failure.
     */
    if (
      !webhookResponse.ok ||
      webhookData.ok !== true
    ) {
      console.error(
        "[request-model] webhook rejected request:",
        {
          status: webhookResponse.status,
          message:
            webhookData.message ?? null,
          response:
            responseText.slice(0, 1000),
        },
      );

      /*
       * Show the actual Apps Script message while
       * running locally, but keep production generic.
       */
      const message =
        process.env.NODE_ENV ===
          "development" &&
        webhookData.message
          ? `Webhook error: ${webhookData.message}`
          : "We could not submit your request right now. Please try again.";

      return NextResponse.json(
        {
          ok: false,
          message,
        },
        {
          status: 502,
        },
      );
    }

    /*
     * Only a confirmed { ok: true } from Apps Script
     * counts as a successful submission.
     */
    return NextResponse.json(
      {
        ok: true,
        message:
          "Your request has been submitted successfully. Thank you.",
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error(
      "[request-model] submission failed:",
      error,
    );

    return handleRouteError(error);
  }
}