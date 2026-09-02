import "server-only";

import {
  unstable_cache,
  revalidateTag,
} from "next/cache";

import { db } from "@/lib/db";
import { siteConfig } from "@/config/site";

/**
 * All available settings groups.
 */
export type SettingsGroup =
  | "general"
  | "seo"
  | "features"
  | "home"
  | "security"
  | "monetization";

/**
 * Smart Link trigger modes.
 *
 * fixed:
 *   Uses the exact configured trigger count.
 *
 * random_2_3:
 *   Randomly selects 2 or 3 Smart Link triggers.
 *
 * random_3_5:
 *   Randomly selects 3, 4 or 5 Smart Link triggers.
 */
export type SmartLinkTriggerMode =
  | "fixed"
  | "random_2_3"
  | "random_3_5";

/**
 * Defaults for the home page.
 *
 * These were literals inside the hero and the page. Keeping them here means a
 * fresh install still renders sensible copy, while an administrator can change
 * any of it without touching a component.
 */
export const HOME_DEFAULTS = {
  heroTitle:
    "Explore a New Largest Webcam Video Archive",

  heroDescription:
    "Explore an organized collection of videos from creators, streamers, webcams and platforms across the web, all in one searchable archive.",

  quickLinks:
    "Webcam, OnlyFans, Couples, Popular, New Releases",

  featuredOrder: [] as string[],
};

/**
 * Defaults for monetization.
 *
 * These are deliberately disabled on a fresh installation.
 *
 * Smart Link:
 *   Visitor clicks a video.
 *   The configured Smart Link can open in a new tab.
 *
 * Home banner:
 *   Optional background/banner advertising on the home page.
 */
export const MONETIZATION_DEFAULTS = {
  /**
   * Smart Link
   */
  smartLinkEnabled: false,

  smartLinkUrl: "",

  /**
   * Number of Smart Link triggers.
   *
   * Supported values: 1 through 20.
   */
  smartLinkTriggerCount: 3,

  /**
   * Trigger mode.
   *
   * fixed:
   *   Exact configured number.
   *
   * random_2_3:
   *   Randomly 2 or 3.
   *
   * random_3_5:
   *   Randomly 3, 4 or 5.
   */
  smartLinkTriggerMode:
    "fixed" as SmartLinkTriggerMode,

  /**
   * Popunder
   */
  popunderEnabled: false,
  popunderCode: "",

  /**
   * Native Banner
   */
  nativeBannerEnabled: false,
  nativeBannerCode: "",
  nativeBannerPlacement:
    "home" as
      | "home"
      | "listing"
      | "video",

  /**
   * Social Bar
   */
  socialBarEnabled: false,
  socialBarCode: "",

  /**
   * Banner
   */
  bannerEnabled: false,
  bannerCode: "",
  bannerPlacement:
    "home" as
      | "home"
      | "listing"
      | "video",

  /**
   * Body Ad
   */
  bodyAdEnabled: false,
  bodyAdCode: "",

  /**
   * Existing home-banner settings are preserved
   * for backwards compatibility.
   */
  homeBannerEnabled: false,
  homeBannerImageUrl: "",
  homeBannerLink: "",
};

/**
 * Cached settings reader.
 *
 * Settings are stored in `site_settings` and cached for a short period.
 *
 * `revalidateTag("settings")` is called after every update, so an
 * administrator does not need to wait for the normal cache lifetime after
 * changing a setting.
 */
export const getSettings = unstable_cache(
  async (
    group: SettingsGroup,
  ): Promise<
    Record<string, unknown>
  > => {
    const rows =
      await db.siteSetting.findMany({
        where: {
          group,
        },
      });

    const values =
      Object.fromEntries(
        rows.map((row) => [
          row.key,
          row.value,
        ]),
      );

    /**
     * General settings.
     */
    if (group === "general") {
      return {
        siteName:
          siteConfig.name,

        tagline:
          siteConfig.tagline,

        contactEmail:
          siteConfig.contactEmail,

        ...values,
      };
    }

    /**
     * SEO settings.
     */
    if (group === "seo") {
      return {
        defaultTitle:
          siteConfig.name,

        defaultDescription:
          siteConfig.description,

        defaultOgImage:
          siteConfig.defaultOgImage,

        ...values,
      };
    }

    /**
     * Home page settings.
     */
    if (group === "home") {
      return {
        ...HOME_DEFAULTS,
        ...values,
      };
    }

    /**
     * Monetization settings.
     */
    if (
      group ===
      "monetization"
    ) {
      /**
       * Start with safe defaults.
       */
      const settings = {
        ...MONETIZATION_DEFAULTS,
        ...values,
      };

      /**
       * Normalize Smart Link trigger count.
       *
       * Older installations may have:
       * - no value
       * - invalid value
       * - a string value
       *
       * Keep the public runtime safe by always
       * returning a number between 1 and 20.
       */
      const parsedCount =
        Number(
          settings.smartLinkTriggerCount,
        );

      const triggerCount =
        Number.isInteger(
          parsedCount,
        ) &&
        parsedCount >= 1 &&
        parsedCount <= 20
          ? parsedCount
          : MONETIZATION_DEFAULTS.smartLinkTriggerCount;

      /**
       * Normalize Smart Link trigger mode.
       */
      const rawMode =
        String(
          settings.smartLinkTriggerMode ??
            "",
        );

      const triggerMode: SmartLinkTriggerMode =
        rawMode ===
          "random_2_3" ||
        rawMode ===
          "random_3_5"
          ? rawMode
          : "fixed";

      return {
        ...settings,

        smartLinkEnabled:
          Boolean(
            settings.smartLinkEnabled,
          ),

        smartLinkUrl:
          String(
            settings.smartLinkUrl ??
              "",
          ),

        smartLinkTriggerCount:
          triggerCount,

        smartLinkTriggerMode:
          triggerMode,

        popunderEnabled:
          Boolean(
            settings.popunderEnabled,
          ),

        popunderCode:
          String(
            settings.popunderCode ??
              "",
          ),

        nativeBannerEnabled:
          Boolean(
            settings.nativeBannerEnabled,
          ),

        nativeBannerCode:
          String(
            settings.nativeBannerCode ??
              "",
          ),

        socialBarEnabled:
          Boolean(
            settings.socialBarEnabled,
          ),

        socialBarCode:
          String(
            settings.socialBarCode ??
              "",
          ),

        bannerEnabled:
          Boolean(
            settings.bannerEnabled,
          ),

        bannerCode:
          String(
            settings.bannerCode ??
              "",
          ),

        bodyAdEnabled:
          Boolean(
            settings.bodyAdEnabled,
          ),

        bodyAdCode:
          String(
            settings.bodyAdCode ??
              "",
          ),
      };
    }

    /**
     * Features/security and any future groups.
     */
    return values;
  },
  ["site-settings"],
  {
    revalidate: 300,
    tags: ["settings"],
  },
);

/**
 * Create or update one setting.
 */
export async function upsertSetting(
  key: string,
  value: unknown,
  group: SettingsGroup,
): Promise<void> {
  await db.siteSetting.upsert({
    where: {
      key,
    },

    create: {
      key,
      group,
      value: value as never,
    },

    update: {
      value: value as never,
      group,
    },
  });

  /**
   * Immediately invalidate the cached settings.
   */
  revalidateTag(
    "settings",
  );
}