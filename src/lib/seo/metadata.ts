import type { Metadata } from "next";
import { siteConfig } from "@/config/site";

export type PageSeo = {
  title: string;
  description?: string | null;
  /** Path only, e.g. "/content/example-title". */
  path: string;
  image?: string | null;
  type?: "website" | "article" | "profile";
  publishedTime?: Date | null;
  noIndex?: boolean;
  /**
   * Current page of a paginated listing.
   *
   * Page 2+ self-canonicalises rather than pointing at page 1 — claiming to be
   * page 1 is a duplicate-content signal — and is marked `noindex, follow` so
   * crawlers still traverse to the items without indexing the shell itself.
   */
  page?: number;
};

export function absoluteUrl(path: string): string {
  return new URL(path, siteConfig.url).toString();
}

/** Adds ?page=N to a path, preserving any query it already carries. */
function appendPage(path: string, page: number): string {
  return path.includes("?") ? `${path}&page=${page}` : `${path}?page=${page}`;
}

/**
 * Builds a complete metadata object — canonical, Open Graph and X cards —
 * so every route gets consistent tags from one place.
 */
export function buildMetadata(seo: PageSeo): Metadata {
  const page = seo.page ?? 1;
  const isPaginated = page > 1;

  // Self-canonical: a listing page keeps its own address, including ?page.
  const canonical = absoluteUrl(isPaginated ? appendPage(seo.path, page) : seo.path);
  const description = seo.description?.slice(0, 180) ?? siteConfig.description;
  const image = seo.image ?? siteConfig.defaultOgImage;

  const robots = seo.noIndex
    ? { index: false, follow: false }
    : isPaginated
      ? { index: false, follow: true }
      : { index: true, follow: true };

  return {
    title: isPaginated ? `${seo.title} — page ${page}` : seo.title,
    description,
    alternates: { canonical },
    robots,
    openGraph: {
      type: seo.type ?? "website",
      title: seo.title,
      description,
      url: canonical,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      images: [{ url: absoluteUrl(image), width: 1200, height: 630, alt: seo.title }],
      ...(seo.publishedTime ? { publishedTime: seo.publishedTime.toISOString() } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description,
      site: siteConfig.twitterHandle,
      images: [absoluteUrl(image)],
    },
  };
}

/** Root metadata: title template plus site-wide defaults. */
export const rootMetadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    locale: siteConfig.locale,
    url: siteConfig.url,
  },
  twitter: { card: "summary_large_image", site: siteConfig.twitterHandle },
};
