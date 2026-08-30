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
  smartLinkEnabled: false,

  smartLinkUrl: "",

  /*
   * Allowed values in the admin UI are 1, 2 or 3.
   * Default is 2.
   */
  smartLinkTriggerCount: 2,

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
    if (group === "monetization") {
      return {
        ...MONETIZATION_DEFAULTS,
        ...values,
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