import { z } from "zod";
import { cuidSchema, slugSchema } from "./common";

/**
 * Server-side schemas for every administrative mutation.
 *
 * These are the authoritative rules — the forms use the same shapes, but no
 * action trusts anything the browser sends. Every schema is explicit about the
 * fields it accepts, which closes off mass assignment: an extra `role` or
 * `viewCount` in a payload is simply dropped rather than written.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

// ---------------------------------------------------------------- content

export const adminContentSchema = z.object({
  title: z.string().trim().min(3, "Enter a title of at least 3 characters.").max(180),
  slug: slugSchema.optional(),
  summary: optionalText(300),
  description: optionalText(20_000),
  kind: z.enum(["VIDEO", "AUDIO", "IMAGE", "DOCUMENT"]).default("VIDEO"),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  isFeatured: z.boolean().default(false),
  durationSeconds: z.coerce.number().int().min(0).max(360_000).optional(),
  language: z
    .string()
    .trim()
    .length(2, "Use a two-letter language code.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  publishedAt: z.coerce.date().optional(),
  creatorId: cuidSchema.optional().or(z.literal("").transform(() => undefined)),
  categoryId: cuidSchema.optional().or(z.literal("").transform(() => undefined)),
  tagIds: z.array(cuidSchema).max(25).default([]),
  thumbnailUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  externalUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  seoTitle: optionalText(70),
  seoDescription: optionalText(180),
  ogImageUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type AdminContentInput = z.infer<typeof adminContentSchema>;

export const bulkContentSchema = z.object({
  ids: z.array(cuidSchema).min(1, "Select at least one item.").max(200),
  action: z.enum(["publish", "unpublish", "archive", "feature", "unfeature", "delete"]),
  /** Destructive actions require an explicit confirmation flag. */
  confirmed: z.boolean().default(false),
});

// ---------------------------------------------------------------- creator

/**
 * Platforms offered on the creator form.
 *
 * A fixed list rather than free-form rows: it keeps the stored keys stable so
 * the profile can render a known icon per platform, and it stops the field
 * becoming a place arbitrary links are pasted.
 */
export const SOCIAL_PLATFORMS = [
  { key: "twitter", label: "X / Twitter", placeholder: "https://x.com/username" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/username" },
  { key: "onlyfans", label: "OnlyFans", placeholder: "https://onlyfans.com/username" },
  { key: "telegram", label: "Telegram", placeholder: "https://t.me/username" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@username" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@username" },
] as const;

export type SocialPlatformKey = (typeof SOCIAL_PLATFORMS)[number]["key"];

const optionalUrl = z
  .string()
  .url("Enter a full URL including https://")
  .max(300)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const adminCreatorSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(120),
  slug: slugSchema.optional(),
  bio: optionalText(2000),
  about: optionalText(6000),
  // Only a real, explicitly entered address is stored — never invented.
  websiteUrl: z
    .string()
    .url("Enter a full URL including https://")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  socialLinks: z.record(z.string(), optionalUrl).optional(),
  /** Blank means unknown, which is honest — it is not backfilled from createdAt. */
  startedAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  avatarUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  isVerified: z.boolean().default(false),
  isActive: z.boolean().default(true),
  seoTitle: optionalText(70),
  seoDescription: optionalText(180),
});

export type AdminCreatorInput = z.infer<typeof adminCreatorSchema>;

// ---------------------------------------------------------------- category

export const adminCategorySchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80),
  slug: slugSchema.optional(),
  description: optionalText(500),
  iconKey: optionalText(40),
  parentId: cuidSchema.optional().or(z.literal("").transform(() => undefined)),
  position: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  seoTitle: optionalText(70),
  seoDescription: optionalText(180),
});

export type AdminCategoryInput = z.infer<typeof adminCategorySchema>;

/** Categories with content must be handled explicitly, never silently. */
export const deleteCategorySchema = z.object({
  id: cuidSchema,
  /** Where to move any content currently filed under it. */
  reassignToId: cuidSchema.optional().or(z.literal("").transform(() => undefined)),
  confirmed: z.literal(true, { message: "Confirm the deletion to continue." }),
});

// ---------------------------------------------------------------- tag

export const adminTagSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(60),
  slug: slugSchema.optional(),
  description: optionalText(300),
});

export type AdminTagInput = z.infer<typeof adminTagSchema>;

export const mergeTagsSchema = z
  .object({
    sourceId: cuidSchema,
    targetId: cuidSchema,
  })
  .refine((data) => data.sourceId !== data.targetId, {
    message: "Pick two different topics.",
    path: ["targetId"],
  });

// ---------------------------------------------------------------- user

export const adminUserActionSchema = z.object({
  userId: cuidSchema,
  action: z.enum(["suspend", "reinstate"]),
});

/** Role changes are ADMIN-only and are audited. */
export const adminRoleChangeSchema = z.object({
  userId: cuidSchema,
  role: z.enum(["USER", "MODERATOR", "ADMIN"]),
});

// ---------------------------------------------------------------- report

export const adminReportSchema = z.object({
  reportId: cuidSchema,
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]),
  /** Internal only — never rendered on a public page. */
  handlerNote: optionalText(2000),
});

// ---------------------------------------------------------------- settings

export const siteSettingsSchema = z.object({
  siteName: z.string().trim().min(2).max(60),
  tagline: optionalText(160),
  contactEmail: z
    .string()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  paginationSize: z.coerce.number().int().min(12).max(60).default(24),
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: optionalText(300),
});

/**
 * Home page content.
 *
 * The headline, the intro and the shortcut tiles were literals inside two
 * components. Every one of them is copy an administrator should be able to
 * change without a deploy, so they live here and are read at request time.
 */
export const homeSettingsSchema = z.object({
  heroTitle: z.string().trim().min(4, "Enter a headline.").max(120),
  heroDescription: optionalText(300),
  /** Shown as #tags under the search box. Comma-separated in the form. */
  quickLinks: z.string().trim().max(200).optional(),
  /** Ordered content ids for the featured block: first is the large slot. */
  featuredOrder: z.array(cuidSchema).max(12).default([]),
});

/**
 * Changing the administrator unlock code.
 *
 * Six characters is the floor rather than a full password policy: this is a
 * convenience shortcut behind a rate limiter, and demanding a passphrase would
 * push people back to typing their password every time — which is the thing it
 * exists to avoid. Any characters are allowed.
 */
export const unlockCodeSchema = z
  .object({
    currentCode: z.string().trim().optional(),
    newCode: z.string().trim().min(6, "Use at least 6 characters.").max(72),
    confirmCode: z.string().trim(),
  })
  .refine((data) => data.newCode === data.confirmCode, {
    message: "The two codes do not match.",
    path: ["confirmCode"],
  });

export const seoSettingsSchema = z.object({
  defaultTitle: z.string().trim().min(2).max(70),
  defaultDescription: z.string().trim().min(10).max(180),
  defaultOgImage: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  twitterHandle: optionalText(20),
  robotsAllowIndexing: z.boolean().default(true),
});

// ---------------------------------------------------------------- listing

export const adminListParamsSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  status: z.string().trim().max(24).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(5000).catch(1),
  sort: z.enum(["newest", "oldest", "title", "views", "updated"]).catch("newest"),
});

export type AdminListParams = z.infer<typeof adminListParamsSchema>;
