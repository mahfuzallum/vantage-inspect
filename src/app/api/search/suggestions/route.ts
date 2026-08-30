import type { NextRequest } from "next/server";
import { searchSuggestions } from "@/server/services/search-service";
import { handleRouteError, ok, rateLimitedResponse } from "@/lib/api/response";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";

/** Typeahead for the header search field. Cached briefly at the edge. */
export async function GET(request: NextRequest) {
  try {
    const limit = await rateLimit("search", clientIdentifier(request.headers));
    if (!limit.allowed) return rateLimitedResponse(limit.resetAt);

    const query = request.nextUrl.searchParams.get("q") ?? "";
    const suggestions = await searchSuggestions(query);

    return ok(suggestions, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
