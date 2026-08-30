import { z } from "zod";

/**
 * Server-side environment contract. Parsed once at module load so a
 * misconfigured deployment fails at boot instead of at request time.
 * Never import this from a Client Component.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.string().url().optional(),
  SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(30),
  MEDIA_PROVIDER: z.enum(["local", "s3"]).default("local"),
  MEDIA_LOCAL_ROOT: z.string().default("./public/uploads"),
  MEDIA_PUBLIC_BASE_URL: z.string().default("/uploads"),
  MEDIA_MAX_UPLOAD_MB: z.coerce.number().int().positive().default(512),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().optional(),
  STORAGE_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  MAX_VIDEO_UPLOAD_MB: z.coerce.number().int().positive().default(2048),
  VIDEO_WORK_DIR: z.string().default("./.tmp/video"),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  RATE_LIMIT_STORE: z.enum(["memory", "redis"]).default("memory"),
  EMAIL_PROVIDER: z.enum(["console", "resend", "postmark", "smtp"]).default("console"),
  EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  POSTMARK_MESSAGE_STREAM: z.string().optional(),
  REDIS_URL: z.string().optional(),
});

/** Values that are safe to inline into the client bundle. */
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SITE_NAME: z.string().default("WebcamPrime"),
});

function parseServerEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);

    /*
      A bad .env surfaces as a page failing somewhere far from the cause — the
      media screen, the upload form — because those are simply the first pages
      to read a setting. The message therefore has to carry the fix with it,
      not just the fact of the failure: whoever hits this is looking at a
      broken page and needs to know it is a configuration problem and which
      line to edit.
    */
    throw new Error(
      [
        "Invalid server environment — check your .env file:",
        ...issues,
        "",
        "Run `npm run doctor` to see exactly which lines need fixing.",
      ].join("\n"),
    );
  }
  // A configured transport without a From address would fail at send time;
  // better to refuse at boot.
  if (parsed.data.EMAIL_PROVIDER !== "console" && !parsed.data.EMAIL_FROM) {
    throw new Error(`EMAIL_PROVIDER=${parsed.data.EMAIL_PROVIDER} requires EMAIL_FROM`);
  }

  if (parsed.data.MEDIA_PROVIDER === "s3") {
    const missing = (
      ["STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"] as const
    ).filter((key) => !parsed.data[key]);
    if (missing.length > 0) {
      throw new Error(`MEDIA_PROVIDER=s3 requires: ${missing.join(", ")}`);
    }
  }
  return parsed.data;
}

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/** Lazily validated server env. Throws on first access if misconfigured. */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv();
  return cached;
}

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
});
