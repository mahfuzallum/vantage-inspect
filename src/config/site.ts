import { publicEnv } from "@/lib/env";

/**
 * Build-time site defaults. Anything an administrator should be able to
 * change at runtime lives in the SiteSetting table instead.
 */
export const siteConfig = {
  name: publicEnv.NEXT_PUBLIC_SITE_NAME,
  shortName: "WebcamPrime",
  url: publicEnv.NEXT_PUBLIC_SITE_URL,
  tagline: "The biggest webcam recording archive.",
  description:
    "Explore an organized collection of videos from creators, streamers, webcams and platforms across the web, all in one searchable archive.",
  locale: "en_US",
  twitterHandle: "@webcamprime",
  defaultOgImage: "/og-default.png",
  contactEmail: "hello@example.com",
} as const;

export type SiteConfig = typeof siteConfig;
