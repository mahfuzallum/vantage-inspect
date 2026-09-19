import type { NextRequest } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { handleRouteError, ok } from "@/lib/api/response";
import { getConfiguredMediaProvider } from "@/server/services/storage-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireApiRole("ADMIN", "MODERATOR");
    const body = (await request.json()) as { contentId?: string; objectKey?: string; uploadId?: string };
    const contentId = String(body.contentId ?? "").trim();
    const objectKey = String(body.objectKey ?? "").trim();
    const uploadId = String(body.uploadId ?? "").trim();
    if (!contentId || !objectKey || !uploadId || !objectKey.startsWith(`videos/original/${contentId}/source.`)) {
      return Response.json({ error: { message: "Invalid upload cancellation data." } }, { status: 400 });
    }
    const provider = await getConfiguredMediaProvider();
    const abort = (provider as unknown as { abortMultipartUpload?: (params: { objectKey: string; uploadId: string }) => Promise<void> }).abortMultipartUpload;
    if (!abort) return Response.json({ error: { message: "Multipart cancellation is unavailable." } }, { status: 400 });
    await abort.call(provider, { objectKey, uploadId });
    return ok({ aborted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
