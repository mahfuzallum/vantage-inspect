import type { ContentStatus, MediaKind } from "@prisma/client";

/**
 * View models returned by the service layer. Components consume these, never
 * raw Prisma rows — that keeps DB columns from leaking into the client bundle
 * and lets the schema change without rewriting UI.
 */
export type CreatorSummary = {
  id: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
  isVerified: boolean;
  contentCount: number;
};

export type CategorySummary = {
  id: string;
  slug: string;
  name: string;
  accentHex: string | null;
  contentCount: number;
};

export type TagSummary = {
  id: string;
  slug: string;
  name: string;
  contentCount: number;
};

export type ContentCardModel = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  kind: MediaKind;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  /** Direct preview source used only for muted hover previews when available. */
  previewUrl: string | null;
  viewCount: number;
  favoriteCount: number;
  likeCount: number;
  dislikeCount: number;
  publishedAt: Date | null;
  isFeatured: boolean;
  creator: CreatorSummary | null;
  category: CategorySummary | null;
};

export type PlaybackState = "playable" | "processing" | "unavailable";

export type ContentDetailModel = ContentCardModel & {
  /**
   * What the visitor should actually see. Derived on the server from
   * processing state — a page never receives an internal error string.
   */
  playback: PlaybackState;
  /** HLS master playlist URL, only ever set when playback is "playable". */
  hlsUrl: string | null;
  description: string | null;
  status: ContentStatus;
  language: string | null;
  recordedAt: Date | null;
  mediaUrl: string | null;
  tags: TagSummary[];
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export function emptyPage<T>(perPage: number): Paginated<T> {
  return { items: [], page: 1, perPage, total: 0, totalPages: 0, hasMore: false };
}
