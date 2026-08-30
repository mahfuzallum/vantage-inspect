import type { ContentDetailModel } from "@/types/content";
import { siteConfig } from "@/config/site";
import { absoluteUrl } from "./metadata";

type JsonLd = Record<string, unknown>;

/** ISO 8601 duration, e.g. 3725s -> "PT1H2M5S". */
function isoDuration(seconds: number | null): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s ? `${s}S` : ""}`;
}

export function videoObjectJsonLd(content: ContentDetailModel): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": content.kind === "AUDIO" ? "AudioObject" : "VideoObject",
    name: content.title,
    description: content.summary ?? content.description ?? undefined,
    thumbnailUrl: content.thumbnailUrl ?? undefined,
    uploadDate: content.publishedAt?.toISOString(),
    duration: isoDuration(content.durationSeconds),
    contentUrl: content.mediaUrl ?? undefined,
    url: absoluteUrl(`/content/${content.slug}`),
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: { "@type": "WatchAction" },
      userInteractionCount: content.viewCount,
    },
    ...(content.creator
      ? {
          creator: {
            "@type": "Organization",
            name: content.creator.name,
            url: absoluteUrl(`/creator/${content.creator.slug}`),
          },
        }
      : {}),
  };
}

/**
 * Contributor entity. Organization rather than Person, since the archive holds
 * institutional deposits far more often than individual ones; only properties
 * the archive actually stores are emitted.
 */
export function creatorJsonLd(creator: {
  name: string;
  slug: string;
  bio?: string | null;
  avatarUrl?: string | null;
  websiteUrl?: string | null;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: creator.name,
    url: absoluteUrl(`/creator/${creator.slug}`),
    ...(creator.bio ? { description: creator.bio } : {}),
    ...(creator.avatarUrl ? { logo: absoluteUrl(creator.avatarUrl) } : {}),
    ...(creator.websiteUrl ? { sameAs: [creator.websiteUrl] } : {}),
  };
}

export function breadcrumbJsonLd(trail: Array<{ label: string; href: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      item: absoluteUrl(crumb.href),
    })),
  };
}

export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteConfig.url}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/** Serialises JSON-LD safely for a <script> tag. */
export function jsonLdScript(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
