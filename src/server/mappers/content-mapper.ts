import "server-only";
import type { Category, Content, Creator, MediaAsset, Tag } from "@prisma/client";
import { resolveAssetUrl } from "@/lib/media";
import { publicMediaUrl } from "@/lib/media/hls";
import { safeExternalUrl } from "@/lib/security/sanitize";
import type {
  CategorySummary,
  ContentCardModel,
  ContentDetailModel,
  CreatorSummary,
  TagSummary,
} from "@/types/content";

/** Prisma `include` shapes reused by every content query. */
export const contentCardInclude = {
  thumbnail: true,
  source: true,
  creator: { include: { avatar: true } },
  category: true,
} as const;

export const contentDetailInclude = {
  ...contentCardInclude,
  source: true,
  tags: { include: { tag: true } },
} as const;

/**
 * Decides what a visitor may play.
 *
 * Only a published recording with a finished transcode is playable. Anything
 * mid-pipeline reports "processing"; everything else is simply unavailable.
 * The distinction between "failed" and "blocked" is deliberately not exposed —
 * that is operator information, not visitor information.
 */
export function playbackStateFor(row: {
  status: string;
  processingStatus?: string | null;
  hlsMasterKey?: string | null;
  externalUrl?: string | null;
  sourceId?: string | null;
}): "playable" | "processing" | "unavailable" {
  if (row.status !== "PUBLISHED") return "unavailable";

  if (
    row.processingStatus === "PROCESSING" ||
    row.processingStatus === "QUEUED" ||
    row.processingStatus === "UPLOADING"
  ) {
    return "processing";
  }
  if (row.processingStatus === "FAILED") return "unavailable";

  // Either a completed transcode, or an external/direct source predating the
  // pipeline — both are legitimately playable.
  if (row.hlsMasterKey || row.externalUrl || row.sourceId) return "playable";
  return "unavailable";
}

type CreatorRow = Creator & { avatar: MediaAsset | null };

export async function toCreatorSummary(row: CreatorRow | null): Promise<CreatorSummary | null> {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    avatarUrl: await resolveAssetUrl(row.avatar),
    isVerified: row.isVerified,
    contentCount: row.contentCount,
  };
}

export function toCategorySummary(row: Category | null): CategorySummary | null {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    accentHex: row.accentHex,
    contentCount: row.contentCount,
  };
}

export function toTagSummary(row: Tag): TagSummary {
  return { id: row.id, slug: row.slug, name: row.name, contentCount: row.contentCount };
}

type ContentCardRow = Content & {
  thumbnail: MediaAsset | null;
  source: MediaAsset | null;
  creator: CreatorRow | null;
  category: Category | null;
};

export async function toContentCard(row: ContentCardRow): Promise<ContentCardModel> {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    kind: row.kind,
    durationSeconds: row.durationSeconds,
    thumbnailUrl: await resolveAssetUrl(row.thumbnail),
    previewUrl: await resolveAssetUrl(row.source),
    viewCount: row.viewCount,
    favoriteCount: row.favoriteCount,
    likeCount: row.likeCount,
    dislikeCount: row.dislikeCount,
    publishedAt: row.publishedAt,
    isFeatured: row.isFeatured,
    creator: await toCreatorSummary(row.creator),
    category: toCategorySummary(row.category),
  };
}

export function toContentCards(rows: ContentCardRow[]): Promise<ContentCardModel[]> {
  return Promise.all(rows.map(toContentCard));
}

type ContentDetailRow = ContentCardRow & {
  source: MediaAsset | null;
  tags: Array<{ tag: Tag }>;
};

export async function toContentDetail(
  row: ContentDetailRow,
  /**
   * Staff preview. The publication gate below exists so a draft cannot be
   * played by a visitor who guesses its slug; a reviewer checking their own
   * unpublished upload needs the opposite. The caller decides, having already
   * established the session role — this function never reads a request.
   */
  allowUnpublishedPlayback = false,
): Promise<ContentDetailModel> {
  const card = await toContentCard(row);
  // Stored media wins; externalUrl is the fallback for third-party hosts.
  const mediaUrl = (await resolveAssetUrl(row.source)) ?? safeExternalUrl(row.externalUrl);

  const playback = playbackStateFor(row);
  const hlsUrl = publicMediaUrl(row.hlsMasterKey);

  // What playback would be if the record were published. Used only to decide
  // whether a preview has anything to show.
  const hasSource = Boolean(row.hlsMasterKey || row.externalUrl || row.sourceId);
  const previewable =
    allowUnpublishedPlayback &&
    hasSource &&
    row.processingStatus !== "PROCESSING" &&
    row.processingStatus !== "QUEUED" &&
    row.processingStatus !== "UPLOADING" &&
    row.processingStatus !== "FAILED";

  return {
    ...card,
    playback: previewable && playback !== "playable" ? "playable" : playback,
    // Never handed out unless the recording is genuinely playable.
    hlsUrl: playback === "playable" || previewable ? hlsUrl : null,
    description: row.description,
    status: row.status,
    language: row.language,
    recordedAt: row.recordedAt,
    mediaUrl: playback === "playable" || previewable ? mediaUrl : null,
    tags: row.tags.map((link: { tag: Tag }) => toTagSummary(link.tag)),
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    ogImageUrl: row.ogImageUrl,
  };
}
