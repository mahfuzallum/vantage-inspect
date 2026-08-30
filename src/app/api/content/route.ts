import type { NextRequest } from "next/server";
import { listContent } from "@/server/services/content-service";
import { contentFilterSchema } from "@/validation/content";
import { handleRouteError, ok, rateLimitedResponse } from "@/lib/api/response";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";
import type { SortOption } from "@/config/sorting";

/**
 * Read-only listing endpoint backing "load more" and any future client-side
 * filtering. Server Components call the service directly instead.
 */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit("api", clientIdentifier(request.headers));
    if (!limit.allowed) return rateLimitedResponse(limit.resetAt);

    const filters = contentFilterSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    const result = await listContent({
      page: filters.page,
      perPage: filters.perPage,
      sort: filters.sort as SortOption,
      categorySlug: filters.category,
      tagSlug: filters.tag,
      creatorSlug: filters.creator,
    });

    return ok(result, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
