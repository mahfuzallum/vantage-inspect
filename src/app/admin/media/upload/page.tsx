import Link from "next/link";

import { Container } from "@/components/layout/container";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { VideoUploadForm } from "@/components/admin/video-upload-form";

import { requireStaff } from "@/lib/auth/guards";
import { safeQuery } from "@/lib/db";
import { serverEnv } from "@/lib/env";

import { getContentFormOptions } from "@/server/services/admin-service";
import { routes } from "@/config/routes";

export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Video formats accepted by the upload validation pipeline.
 *
 * The extension is only a hint. The backend also validates the actual
 * container/magic bytes and the worker confirms the media with ffprobe.
 *
 * Supported:
 * - MP4
 * - MPEG-TS (.ts)
 * - MOV
 * - WebM
 * - Matroska (.mkv)
 * - M4V
 *
 * This is intentionally a mutable string[] because
 * VideoUploadForm expects string[].
 */
const ACCEPTED: string[] = [
  "mp4",
  "ts",
  "mov",
  "webm",
  "mkv",
  "m4v",
];

export default async function UploadVideoPage() {
  await requireStaff();

  const options = await safeQuery(
    () => getContentFormOptions(),
    {
      creators: [],
      categories: [],
      tags: [],
    },
  );

  return (
    <Container className="max-w-2xl py-8">
      <AdminPageHeader
        title="Upload a video"
        breadcrumb={{
          label: "Media",
          href: routes.admin.media,
        }}
        description="Attribute it, describe it, and hand it to the processing queue."
      />

      {options.categories.length === 0 ? (
        <p className="mb-6 rounded-control border border-caution/40 bg-caution/10 px-3 py-2.5 text-sm text-caution">
          No categories exist yet, and a recording needs one.{" "}
          <Link
            href={routes.admin.categoryNew}
            className="underline"
          >
            Create the first category
          </Link>{" "}
          before uploading.
        </p>
      ) : null}

      <VideoUploadForm
        categories={options.categories}
        tags={options.tags}
        maxUploadMb={
          serverEnv().MAX_VIDEO_UPLOAD_MB
        }
        acceptedExtensions={ACCEPTED}
      />
    </Container>
  );
}