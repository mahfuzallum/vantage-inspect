import { z } from "zod";

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter a display name.").max(60),
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_]+$/i, "Letters, numbers and underscores only."),
});

export const updatePreferencesSchema = z.object({
  autoplay: z.boolean().default(false),
  keepHistory: z.boolean().default(true),
  itemsPerPage: z.coerce.number().int().min(12).max(60).default(24),
  emailNotifications: z.boolean().default(true),
  preferredLocale: z.string().min(2).max(5).default("en"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
