import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/auth/guards";
import { handleRouteError, ok } from "@/lib/api/response";
import { ApiError } from "@/lib/api/errors";
import { resolveAssetUrl } from "@/lib/media";
import { recordAudit, AUDIT_ACTIONS } from "@/server/services/audit-service";
import { uniqueSlug, slugify } from "@/lib/utils/slug";
import { normalizeQuery } from "@/lib/security/sanitize";

export const runtime = "nodejs";

const PAGE_SIZE = 40;

/**
 * Creator lookup for the upload screen.
 *
 * Filtered on the server rather than shipping the whole roster to the browser:
 * an archive with a few thousand contributors would otherwise send a large
 * payload on every page load to power a box that shows eight rows at a time.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiRole("ADMIN", "MODERATOR");

    const query = normalizeQuery(request.nextUrl.searchParams.get("q"), 60);

    const creators = await db.creator.findMany({
      where: {
        isActive: true,
        ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
      },
      orderBy: query ? { name: "asc" } : [{ contentCount: "desc" }, { name: "asc" }],
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        slug: true,
        isVerified: true,
        contentCount: true,
        avatar: true,
      },
    });

    return ok({
      creators: await Promise.all(
        creators.map(async (creator) => ({
          id: creator.id,
          name: creator.name,
          slug: creator.slug,
          isVerified: creator.isVerified,
          contentCount: creator.contentCount,
          avatarUrl: await resolveAssetUrl(creator.avatar),
        })),
      ),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Creates a contributor from the upload screen.
 *
 * Name only. The full creator form covers bio, links and artwork; asking for
 * all of that mid-upload would be a detour from the task at hand, and the
 * record can be completed later from the creators section.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireApiRole("ADMIN", "MODERATOR");

    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (name.length < 2) throw new ApiError("BAD_REQUEST", "Enter a name of at least 2 characters.");
    if (name.length > 80) throw new ApiError("BAD_REQUEST", "Use 80 characters or fewer.");

    const duplicate = await db.creator.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (duplicate) {
      throw new ApiError("CONFLICT", `${duplicate.name} already exists — search for them instead.`);
    }

    const slug = await uniqueSlug(slugify(name), async (candidate) =>
      Boolean(await db.creator.findUnique({ where: { slug: candidate }, select: { id: true } })),
    );

    const creator = await db.creator.create({
      data: { name, slug },
      select: { id: true, name: true, slug: true, isVerified: true, contentCount: true },
    });

    await recordAudit({
      actorId: admin.id,
      action: AUDIT_ACTIONS.CREATOR_CREATED,
      entityType: "creator",
      entityId: creator.id,
      metadata: { name: creator.name, via: "upload" },
    });

    return ok({ creator: { ...creator, avatarUrl: null } }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
