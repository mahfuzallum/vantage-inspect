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
 * Smart Link settings:
 *
 * smartLinkEnabled
 * smartLinkUrl
 * smartLinkTriggerCount
 * smartLinkTriggerMode
 *
 * Advertisement settings:
 *
 * popunderEnabled
 * popunderCode
 *
 * nativeBannerEnabled
 * nativeBannerCode
 * nativeBannerPlacement
 *
 * socialBarEnabled
 * socialBarCode
 *
 * bannerEnabled
 * bannerCode
 * bannerPlacement
 *
 * bodyAdEnabled
 * bodyAdCode
 *
 * No separate database model is required.
 */
export async function updateMonetizationSettingsAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireAdmin();

  const text = (name: string) =>
    String(
      formData.get(name) ?? "",
    ).trim();

  const checked = (name: string) =>
    formData.get(name) === "on";

  const fieldErrors: Record<
    string,
    string[]
  > = {};

  /**
   * ------------------------------------------------------------
   * Smart Link
   * ------------------------------------------------------------
   */

  const smartLinkUrl =
    text("smartLinkUrl");

  const triggerMode =
    text("smartLinkTriggerMode") ||
    "fixed";

  const triggerRaw =
    text("smartLinkTriggerCount") ||
    "3";

  /**
   * Smart Link URL validation.
   */
  if (
    checked("smartLinkEnabled") &&
    !smartLinkUrl
  ) {
    fieldErrors.smartLinkUrl = [
      "Smart Link URL is required when enabled.",
    ];
  }

  if (smartLinkUrl) {
    try {
      const u = new URL(
        smartLinkUrl,
      );

      if (
        ![
          "http:",
          "https:",
        ].includes(u.protocol)
      ) {
        throw new Error();
      }
    } catch {
      fieldErrors.smartLinkUrl = [
        "Enter a valid HTTP or HTTPS URL.",
      ];
    }
  }

  /**
   * Smart Link trigger count.
   *
   * 1 = first video click
   * 2 = second video click
   * 3 = third video click
   * ...
   * 20 = twentieth video click
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
    triggerCount > 20
  ) {
    fieldErrors.smartLinkTriggerCount = [
      "Trigger count must be between 1 and 20.",
    ];
  }

  /**
   * Smart Link trigger mode.
   *
   * fixed:
   * Uses the exact trigger count.
   *
   * random_2_3:
   * Uses a random trigger between 2 and 3.
   *
   * random_3_5:
   * Uses a random trigger between 3 and 5.
   */
  const validTriggerModes = [
    "fixed",
    "random_2_3",
    "random_3_5",
  ];

  if (
    !validTriggerModes.includes(
      triggerMode,
    )
  ) {
    fieldErrors.smartLinkTriggerMode = [
      "Choose a valid trigger mode.",
    ];
  }

  /**
   * ------------------------------------------------------------
   * Advertisement placements
   * ------------------------------------------------------------
   */

  const placements = [
    "home",
    "listing",
    "video",
  ];

  const nativePlacement =
    text(
      "nativeBannerPlacement",
    ) || "home";

  const bannerPlacement =
    text("bannerPlacement") ||
    "home";

  if (
    !placements.includes(
      nativePlacement,
    )
  ) {
    fieldErrors.nativeBannerPlacement = [
      "Choose a valid placement.",
    ];
  }

  if (
    !placements.includes(
      bannerPlacement,
    )
  ) {
    fieldErrors.bannerPlacement = [
      "Choose a valid placement.",
    ];
  }

  /**
   * ------------------------------------------------------------
   * Advertisement code validation
   * ------------------------------------------------------------
   */

  const codeFields = [
    [
      "popunderCode",
      "Popunder code",
    ],
    [
      "nativeBannerCode",
      "Native Banner code",
    ],
    [
      "socialBarCode",
      "Social Bar code",
    ],
    [
      "bannerCode",
      "Banner code",
    ],
    [
      "bodyAdCode",
      "Body Ad code",
    ],
  ] as const;

  for (
    const [
      name,
      label,
    ] of codeFields
  ) {
    if (
      text(name).length >
      200_000
    ) {
      fieldErrors[name] = [
        `${label} is too large (maximum 200,000 characters).`,
      ];
    }
  }

  /**
   * Stop before saving when validation fails.
   */
  if (
    Object.keys(
      fieldErrors,
    ).length
  ) {
    return {
      status: "error",
      fieldErrors,
    };
  }

  /**
   * ------------------------------------------------------------
   * Values to save
   * ------------------------------------------------------------
   */

  const values: Record<
    string,
    unknown
  > = {
    /**
     * Smart Link
     */
    smartLinkEnabled:
      checked(
        "smartLinkEnabled",
      ),

    smartLinkUrl:
      smartLinkUrl || null,

    smartLinkTriggerCount:
      triggerCount,

    smartLinkTriggerMode:
      triggerMode,

    /**
     * Popunder
     */
    popunderEnabled:
      checked(
        "popunderEnabled",
      ),

    popunderCode:
      text(
        "popunderCode",
      ) || null,

    /**
     * Native Banner
     */
    nativeBannerEnabled:
      checked(
        "nativeBannerEnabled",
      ),

    nativeBannerCode:
      text(
        "nativeBannerCode",
      ) || null,

    nativeBannerPlacement:
      nativePlacement,

    /**
     * Social Bar
     */
    socialBarEnabled:
      checked(
        "socialBarEnabled",
      ),

    socialBarCode:
      text(
        "socialBarCode",
      ) || null,

    /**
     * Banner
     */
    bannerEnabled:
      checked(
        "bannerEnabled",
      ),

    bannerCode:
      text(
        "bannerCode",
      ) || null,

    bannerPlacement:
      bannerPlacement,

    /**
     * Body Ad
     */
    bodyAdEnabled:
      checked(
        "bodyAdEnabled",
      ),

    bodyAdCode:
      text(
        "bodyAdCode",
      ) || null,
  };

  /**
   * ------------------------------------------------------------
   * Save settings
   * ------------------------------------------------------------
   */

  try {
    for (
      const [
        key,
        value,
      ] of Object.entries(
        values,
      )
    ) {
      await upsertSetting(
        key,
        value,
        "monetization",
      );
    }

    await recordAudit({
      actorId: admin.id,
      action:
        AUDIT_ACTIONS.SETTINGS_CHANGED,
      entityType: "settings",
      entityId:
        "monetization",
      metadata: {
        keys:
          Object.keys(
            values,
          ),
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

  /**
   * Revalidate affected pages.
   */
  revalidatePath(
    routes.home,
  );

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
        fieldErrorsFrom(
          parsed.error,
        ),
    };
  }

  try {
    const existing =
      await db.siteSetting.findUnique(
        {
          where: {
            key:
              "adminUnlockCode",
          },

          select: {
            value: true,
          },
        },
      );

    const currentHash =
      typeof existing?.value ===
      "string"
        ? existing.value
        : null;

    if (currentHash) {
      const valid =
        await verifyPassword(
          parsed.data
            .currentCode ??
            "",
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