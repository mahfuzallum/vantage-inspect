import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);

const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use 128 characters or fewer.")
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/\d/, "Include a number.");

export const credentialsSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const loginSchema = credentialsSchema.extend({
  rememberDevice: z.coerce.boolean().default(false),
  next: z.string().optional(),
});

export const registerSchema = z
  .object({
    email,
    username: z
      .string()
      .trim()
      .min(3, "Use at least 3 characters.")
      .max(24, "Use 24 characters or fewer.")
      .regex(/^[a-z0-9_]+$/i, "Letters, numbers and underscores only."),
    displayName: z.string().trim().min(2, "Enter a display name.").max(60),
    password,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { message: "Accept the terms to continue." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20),
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
