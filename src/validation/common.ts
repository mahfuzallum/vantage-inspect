import { z } from "zod";
import { MAX_PAGE_SIZE } from "@/config/pagination";

export const slugSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.");

export const cuidSchema = z.string().min(20).max(40);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(5000).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

export const searchQuerySchema = z
  .string()
  .trim()
  .min(2, "Enter at least two characters.")
  .max(120);

export type Pagination = z.infer<typeof paginationSchema>;
