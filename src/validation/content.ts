import { z } from "zod";
import { cuidSchema, paginationSchema, slugSchema } from "./common";
import { SORT_OPTIONS } from "@/config/sorting";

const sortValues = SORT_OPTIONS.map((option) => option.value) as [string, ...string[]];

export const contentFilterSchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  category: slugSchema.optional(),
  tag: slugSchema.optional(),
  creator: slugSchema.optional(),
  kind: z.enum(["VIDEO", "AUDIO", "IMAGE", "DOCUMENT"]).optional(),
  sort: z.enum(sortValues).default("newest"),
  minDuration: z.coerce.number().int().min(0).optional(),
  maxDuration: z.coerce.number().int().min(0).optional(),
});

export const createContentSchema = z.object({
  title: z.string().trim().min(3, "Enter a title.").max(180),
  slug: slugSchema.optional(),
  summary: z.string().trim().max(300).optional(),
  description: z.string().trim().max(20_000).optional(),
  kind: z.enum(["VIDEO", "AUDIO", "IMAGE", "DOCUMENT"]).default("VIDEO"),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  isFeatured: z.boolean().default(false),
  durationSeconds: z.coerce.number().int().min(0).max(360_000).optional(),
  language: z.string().length(2).optional(),
  recordedAt: z.coerce.date().optional(),
  publishedAt: z.coerce.date().optional(),
  creatorId: cuidSchema.optional(),
  categoryId: cuidSchema.optional(),
  thumbnailId: cuidSchema.optional(),
  sourceId: cuidSchema.optional(),
  externalUrl: z.string().url().optional(),
  tagIds: z.array(cuidSchema).max(25).default([]),
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(180).optional(),
});

export const updateContentSchema = createContentSchema.partial();

export const reportSchema = z.object({
  targetType: z.enum(["CONTENT", "CREATOR", "COMMENT"]).default("CONTENT"),
  targetId: cuidSchema,
  reason: z.enum(["BROKEN_MEDIA", "INCORRECT_METADATA", "COPYRIGHT", "SPAM", "OTHER"]),
  message: z.string().trim().max(2000).optional(),
});

export const progressSchema = z.object({
  contentId: cuidSchema,
  progressSeconds: z.coerce.number().int().min(0).max(360_000),
  completed: z.boolean().default(false),
});

export type ContentFilterInput = z.infer<typeof contentFilterSchema>;
export type CreateContentInput = z.infer<typeof createContentSchema>;
