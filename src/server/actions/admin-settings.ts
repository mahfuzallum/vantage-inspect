"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { upsertSetting } from "@/server/services/settings-service";
import {
  AUDIT_ACTIONS,
  recordAudit,
} from "@/server/services/audit-service";

import {
  homeSettingsSchema,
  seoSettingsSchema,
  siteSettingsSchema,
  unlockCodeSchema,
} from "@/validation/admin";

import {
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";

import { routes } from "@/config/routes";
import type { AdminFormState } from "./admin-content";

/**
 * Convert Zod validation issues into the format expected by
 * the admin form components.
 */
function fieldErrorsFrom(error: {
  issues: Array<{
    path: PropertyKey[];
    message: string;
  }>;
}) {
  const output: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = String(
      issue.path[0] ?? "_",
    );

    (output[key] ??= []).push(
      issue.message,
    );
  }

  return output;
}

/**
 * Update general site settings.
 */
export async function updateSiteSettingsAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireAdmin();

  const parsed =
    siteSettingsSchema.safeParse({
      siteName:
        formData.get("siteName"),

      tagline:
        formData.get("tagline") ??
        undefined,

      contactEmail:
        formData.get("contactEmail") ??
        undefined,

      paginationSize:
        formData.get("paginationSize") ??
        24,

      maintenanceMode:
        formData.get("maintenanceMode") ===
        "on",

      maintenanceMessage:
        formData.get(
          "maintenanceMessage",
        ) ?? undefined,
    });

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors:
        fieldErrorsFrom(parsed.error),
    };
  }

  try {
    for (const [
      key,
      value,
    ] of Object.entries(parsed.data)) {
      await upsertSetting(
        key,
        value ?? null,
        "general",
      );
    }

    await recordAudit({
      actorId: admin.id,
      action:
        AUDIT_ACTIONS.SETTINGS_CHANGED,
      entityType: "settings",
      entityId: "general",
      metadata: {
        keys: Object.keys(
          parsed.data,
        ),
      },
    });
  } catch (error) {
    console.error(
      "[admin] settings update failed:",
      error,
    );

    return {
      status: "error",
      message:
        "That didn't save. Try again.",
    };
  }

  revalidatePath(
    routes.admin.settings,
  );

  return {
    status: "success",
    message: "Settings saved.",
  };
}

/**
 * Update SEO settings.
 */
export async function updateSeoSettingsAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireAdmin();

  const parsed =
    seoSettingsSchema.safeParse({
      defaultTitle:
        formData.get("defaultTitle"),

      defaultDescription:
        formData.get(
          "defaultDescription",
        ),

      defaultOgImage:
        formData.get(
          "defaultOgImage",
        ) ?? undefined,

      twitterHandle:
        formData.get(
          "twitterHandle",
        ) ?? undefined,

      robotsAllowIndexing:
        formData.get(
          "robotsAllowIndexing",
        ) === "on",
    });

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors:
        fieldErrorsFrom(parsed.error),
    };
  }

  try {
    for (const [
      key,
      value,
    ] of Object.entries(parsed.data)) {
      await upsertSetting(
        key,
        value ?? null,
        "seo",
      );
    }

    await recordAudit({
      actorId: admin.id,
      action:
        AUDIT_ACTIONS.SETTINGS_CHANGED,
      entityType: "settings",
      entityId: "seo",
      metadata: {
        keys: Object.keys(
          parsed.data,
        ),
      },
    });
  } catch (error) {
    console.error(
      "[admin] SEO settings update failed:",
      error,
    );

    return {
      status: "error",
      message:
        "That didn't save. Try again.",
    };
  }

  revalidatePath(
    routes.admin.seo,
  );

  return {
    status: "success",
    message:
      "SEO defaults saved.",
  };
}

/**
 * Home page settings.
 */
export async function updateHomeSettingsAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireAdmin();

  const parsed =
    homeSettingsSchema.safeParse({
      heroTitle:
        formData.get("heroTitle"),

      heroDescription:
        formData.get(
          "heroDescription",
        ) ?? undefined,

      quickLinks:
        formData.get(
          "quickLinks",
        ) ?? undefined,

      featuredOrder:
        formData
          .getAll("featuredOrder")
          .map(String)
          .filter(Boolean),
    });

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors:
        fieldErrorsFrom(parsed.error),
    };
  }

  try {
    for (const [
      key,
      value,
    ] of Object.entries(parsed.data)) {
      await upsertSetting(
        key,
        value ?? null,
        "home",
      );
    }

    await recordAudit({
      actorId: admin.id,
      action:
        AUDIT_ACTIONS.SETTINGS_CHANGED,
      entityType: "settings",
      entityId: "home",
      metadata: {
        keys: Object.keys(
          parsed.data,
        ),
        featured:
          parsed.data.featuredOrder
            .length,
      },
    });
  } catch (error) {
    console.error(
      "[admin] home settings update failed:",
      error,
    );

    return {
      status: "error",
      message:
        "That didn't save. Try again.",
    };
  }

  revalidatePath(routes.home);
  revalidatePath(
    routes.admin.home,
  );

  return {
    status: "success",
    message:
      "Home page updated.",
  };
}

/**
 * ============================================================
 * MONETIZATION / SMART LINK SETTINGS
 * ============================================================
 *
 * Stored in site_settings through the existing settings service.
 *
 * Keys:
 *
 * smartLinkEnabled
 * smartLinkUrl
 * smartLinkTriggerCount
 *
 * homeBannerEnabled
 * homeBannerImageUrl
 * homeBannerLink
 *
 * No separate database model is required.
 */
export async function updateMonetizationSettingsAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireAdmin();

  const smartLinkEnabled =
    formData.get(
      "smartLinkEnabled",
    ) === "on";

  const smartLinkUrlRaw =
    String(
      formData.get(
        "smartLinkUrl",
      ) ?? "",
    ).trim();

  const triggerRaw =
    String(
      formData.get(
        "smartLinkTriggerCount",
      ) ?? "2",
    ).trim();

  const homeBannerEnabled =
    formData.get(
      "homeBannerEnabled",
    ) === "on";

  const homeBannerImageUrl =
    String(
      formData.get(
        "homeBannerImageUrl",
      ) ?? "",
    ).trim();

  const homeBannerLink =
    String(
      formData.get(
        "homeBannerLink",
      ) ?? "",
    ).trim();

  const fieldErrors: Record<
    string,
    string[]
  > = {};

  /*
   * Smart Link URL validation.
   *
   * Empty URL is allowed when Smart Link
   * is disabled.
   */
  if (
    smartLinkEnabled &&
    !smartLinkUrlRaw
  ) {
    fieldErrors.smartLinkUrl = [
      "Smart Link URL is required when Smart Link is enabled.",
    ];
  }

  if (smartLinkUrlRaw) {
    try {
      const parsedUrl =
        new URL(
          smartLinkUrlRaw,
        );

      if (
        parsedUrl.protocol !==
          "http:" &&
        parsedUrl.protocol !==
          "https:"
      ) {
        fieldErrors.smartLinkUrl = [
          "Smart Link must use HTTP or HTTPS.",
        ];
      }
    } catch {
      fieldErrors.smartLinkUrl = [
        "Enter a valid Smart Link URL.",
      ];
    }
  }

  /*
   * Only 1, 2 or 3 triggers are allowed.
   *
   * You can later extend this if required.
   */
  const triggerCount =
    Number.parseInt(
      triggerRaw,
      10,
    );

  if (
    !Number.isInteger(
      triggerCount,
    ) ||
    triggerCount < 1 ||
    triggerCount > 3
  ) {
    fieldErrors.smartLinkTriggerCount = [
      "Trigger count must be 1, 2 or 3.",
    ];
  }

  /*
   * Validate banner image URL if supplied.
   */
  if (homeBannerImageUrl) {
    try {
      const parsedUrl =
        new URL(
          homeBannerImageUrl,
        );

      if (
        parsedUrl.protocol !==
          "http:" &&
        parsedUrl.protocol !==
          "https:"
      ) {
        fieldErrors.homeBannerImageUrl = [
          "Banner image must use HTTP or HTTPS.",
        ];
      }
    } catch {
      fieldErrors.homeBannerImageUrl = [
        "Enter a valid banner image URL.",
      ];
    }
  }

  /*
   * Validate banner destination URL if supplied.
   */
  if (homeBannerLink) {
    try {
      const parsedUrl =
        new URL(
          homeBannerLink,
        );

      if (
        parsedUrl.protocol !==
          "http:" &&
        parsedUrl.protocol !==
          "https:"
      ) {
        fieldErrors.homeBannerLink = [
          "Banner link must use HTTP or HTTPS.",
        ];
      }
    } catch {
      fieldErrors.homeBannerLink = [
        "Enter a valid banner link.",
      ];
    }
  }

  if (
    Object.keys(
      fieldErrors,
    ).length > 0
  ) {
    return {
      status: "error",
      fieldErrors,
    };
  }

  try {
    /*
     * Smart Link settings.
     */
    await upsertSetting(
      "smartLinkEnabled",
      smartLinkEnabled,
      "monetization",
    );

    await upsertSetting(
      "smartLinkUrl",
      smartLinkUrlRaw || null,
      "monetization",
    );

    await upsertSetting(
      "smartLinkTriggerCount",
      triggerCount,
      "monetization",
    );

    /*
     * Home background banner settings.
     */
    await upsertSetting(
      "homeBannerEnabled",
      homeBannerEnabled,
      "monetization",
    );

    await upsertSetting(
      "homeBannerImageUrl",
      homeBannerImageUrl || null,
      "monetization",
    );

    await upsertSetting(
      "homeBannerLink",
      homeBannerLink || null,
      "monetization",
    );

    /*
     * Never record the actual Smart Link URL
     * or banner URLs in the audit log.
     *
     * Only record which configuration group changed.
     */
    await recordAudit({
      actorId: admin.id,
      action:
        AUDIT_ACTIONS.SETTINGS_CHANGED,
      entityType: "settings",
      entityId:
        "monetization",
      metadata: {
        keys: [
          "smartLinkEnabled",
          "smartLinkUrl",
          "smartLinkTriggerCount",
          "homeBannerEnabled",
          "homeBannerImageUrl",
          "homeBannerLink",
        ],
      },
    });
  } catch (error) {
    console.error(
      "[admin] monetization settings update failed:",
      error,
    );

    return {
      status: "error",
      message:
        "Monetization settings could not be saved. Try again.",
    };
  }

  /*
   * Revalidate all pages that can display
   * the Smart Link/banner configuration.
   */
  revalidatePath(routes.home);
  revalidatePath(
    routes.admin.settings,
  );

  return {
    status: "success",
    message:
      "Monetization settings saved.",
  };
}

/**
 * Changes the administrator unlock code.
 */
export async function updateUnlockCodeAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireAdmin();

  const parsed =
    unlockCodeSchema.safeParse({
      currentCode:
        formData.get(
          "currentCode",
        ) ?? undefined,

      newCode:
        formData.get(
          "newCode",
        ),

      confirmCode:
        formData.get(
          "confirmCode",
        ),
    });

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors:
        fieldErrorsFrom(parsed.error),
    };
  }

  try {
    const existing =
      await db.siteSetting.findUnique({
        where: {
          key: "adminUnlockCode",
        },

        select: {
          value: true,
        },
      });

    const currentHash =
      typeof existing?.value ===
      "string"
        ? existing.value
        : null;

    if (currentHash) {
      const valid =
        await verifyPassword(
          parsed.data
            .currentCode ?? "",
          currentHash,
        );

      if (!valid) {
        return {
          status: "error",
          fieldErrors: {
            currentCode: [
              "That is not the current code.",
            ],
          },
        };
      }
    }

    await upsertSetting(
      "adminUnlockCode",
      await hashPassword(
        parsed.data.newCode,
      ),
      "security",
    );

    await recordAudit({
      actorId: admin.id,
      action:
        AUDIT_ACTIONS.SETTINGS_CHANGED,
      entityType: "settings",
      entityId:
        "adminUnlockCode",
      metadata: {
        changed:
          "adminUnlockCode",
      },
    });
  } catch (error) {
    console.error(
      "[admin] unlock code change failed:",
      error,
    );

    return {
      status: "error",
      message:
        "That didn't save. Try again.",
    };
  }

  revalidatePath(
    routes.admin.settings,
  );

  return {
    status: "success",
    message:
      "Unlock code updated.",
  };
}