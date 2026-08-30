import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/auth/guards";
import { handleRouteError, ok } from "@/lib/api/response";
import { resolveAssetUrl } from "@/lib/media";
import { normalizeQuery } from "@/lib/security/sanitize";

export const runtime = "nodejs";

/**
 * Title lookup for the featured picker.
 *
 * Published records only. Featuring a draft would put a slot on the home page
 * that visitors cannot open, so the choice is not offered in the first place.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiRole("ADMIN", "MODERATOR");

    const query = normalizeQuery(request.nextUrl.searchParams.get("q"), 80);
    if (query.length < 2) return ok({ items: [] });

    const rows = await db.content.findMany({
      where: {
        status: "PUBLISHED",
        title: { contains: query, mode: "insensitive" },
      },
      orderBy: { publishedAt: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        slug: true,
        thumbnail: true,
        creator: { select: { name: true } },
      },
    });

    return ok({
      items: await Promise.all(
        rows.map(async (row) => ({
          id: row.id,
          title: row.title,
          slug: row.slug,
          creatorName: row.creator?.name ?? null,
          thumbnailUrl: await resolveAssetUrl(row.thumbnail),
        })),
      ),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
