/**
 * Development seed.
 *
 * Reads the same demo catalogue the application falls back to when the
 * database is empty, so a seeded install and an unseeded one show identical
 * content. One source of truth, no drift between the two.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import {
  CATEGORY_DESCRIPTIONS,
  CREATOR_BIOS,
  mockCategories,
  mockContent,
  mockCreators,
  mockTags,
} from "../src/lib/mock/catalogue";

const db = new PrismaClient();

/**
 * Seed account password.
 *
 * Deliberately NOT a hardcoded default. A published seed password is a
 * standing invitation on any instance where someone forgets to change it, so
 * one is generated per run and printed once. Set SEED_ADMIN_PASSWORD to pin it
 * for a repeatable local environment.
 */
const DEMO_PASSWORD =
  process.env.SEED_ADMIN_PASSWORD ?? `dev-${randomBytes(9).toString("base64url")}`;

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";

async function main() {
  console.log("Seeding…");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const admin = await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      username: "admin",
      displayName: "Archive Admin",
      passwordHash,
      role: "ADMIN",
      emailVerifiedAt: new Date(),
      preference: { create: {} },
    },
  });

  await db.user.upsert({
    where: { email: "reader@example.com" },
    update: {},
    create: {
      email: "reader@example.com",
      username: "reader",
      displayName: "Sample Reader",
      passwordHash,
      role: "USER",
      preference: { create: {} },
    },
  });

  for (const [index, category] of mockCategories.entries()) {
    await db.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: {
        slug: category.slug,
        name: category.name,
        description: CATEGORY_DESCRIPTIONS[category.slug] ?? null,
        position: index,
      },
    });
  }

  for (const tag of mockTags) {
    await db.tag.upsert({
      where: { slug: tag.slug },
      update: {},
      create: { slug: tag.slug, name: tag.name },
    });
  }

  for (const creator of mockCreators) {
    await db.creator.upsert({
      where: { slug: creator.slug },
      update: {},
      create: {
        slug: creator.slug,
        name: creator.name,
        bio: CREATOR_BIOS[creator.slug] ?? null,
        isVerified: creator.isVerified,
      },
    });
  }

  const categoryIds = new Map<string, string>();
  for (const row of await db.category.findMany({ select: { id: true, slug: true } })) {
    categoryIds.set(row.slug, row.id);
  }

  const creatorIds = new Map<string, string>();
  for (const row of await db.creator.findMany({ select: { id: true, slug: true } })) {
    creatorIds.set(row.slug, row.id);
  }

  const tagIds = new Map<string, string>();
  for (const row of await db.tag.findMany({ select: { id: true, slug: true } })) {
    tagIds.set(row.slug, row.id);
  }

  for (const item of mockContent) {
    const tagLinks = item.tagSlugs
      .map((slug) => tagIds.get(slug))
      .filter((id): id is string => Boolean(id))
      .map((tagId) => ({ tagId }));

    const categorySeedId = item.category ? categoryIds.get(item.category.slug) : undefined;
    const creatorSeedId = item.creator ? creatorIds.get(item.creator.slug) : undefined;

    await db.content.upsert({
      where: { slug: item.slug },
      update: {},
      create: {
        slug: item.slug,
        title: item.title,
        summary: item.summary,
        description:
          "Placeholder catalogue text. Replace with a real abstract, a speaker list and any rights information that applies to this recording.",
        kind: "VIDEO",
        status: "PUBLISHED",
        isFeatured: item.isFeatured,
        durationSeconds: item.durationSeconds,
        publishedAt: item.publishedAt,
        recordedAt: item.publishedAt
          ? new Date(item.publishedAt.getTime() - 14 * 86_400_000)
          : null,
        language: "en",
        viewCount: item.viewCount,
        favoriteCount: item.favoriteCount,
        // A nested relation create (`thumbnail` below) forces Prisma's
        // "checked" create input, which does not accept raw foreign keys —
        // the relations have to be connected by name instead.
        category: categorySeedId ? { connect: { id: categorySeedId } } : undefined,
        creator: creatorSeedId ? { connect: { id: creatorSeedId } } : undefined,
        // The generated placeholder artwork is referenced as an external URL so
        // no upload pipeline is needed to see a populated catalogue.
        thumbnail: item.thumbnailUrl
          ? {
              create: {
                kind: "IMAGE",
                provider: "EXTERNAL",
                url: item.thumbnailUrl,
                mimeType: "image/png",
              },
            }
          : undefined,
        tags: { create: tagLinks },
      },
    });
  }

  // Bring the denormalised counters in line with what was just inserted.
  await db.$executeRaw`
    UPDATE categories c SET content_count = COALESCE(sub.total, 0)
    FROM (SELECT category_id, COUNT(*)::int AS total FROM content
          WHERE status = 'PUBLISHED' AND category_id IS NOT NULL GROUP BY category_id) sub
    WHERE c.id = sub.category_id`;

  await db.$executeRaw`
    UPDATE tags t SET content_count = COALESCE(sub.total, 0)
    FROM (SELECT ct.tag_id, COUNT(*)::int AS total FROM content_tags ct
          JOIN content c ON c.id = ct.content_id AND c.status = 'PUBLISHED'
          GROUP BY ct.tag_id) sub
    WHERE t.id = sub.tag_id`;

  await db.$executeRaw`
    UPDATE creators cr SET content_count = COALESCE(sub.total, 0), total_views = COALESCE(sub.views, 0)
    FROM (SELECT creator_id, COUNT(*)::int AS total, SUM(view_count)::int AS views
          FROM content WHERE status = 'PUBLISHED' AND creator_id IS NOT NULL
          GROUP BY creator_id) sub
    WHERE cr.id = sub.creator_id`;

  console.log(
    `Done. ${mockContent.length} recordings, ${mockCategories.length} subjects, ` +
      `${mockTags.length} topics, ${mockCreators.length} contributors.`,
  );
  console.log("");
  console.log("  Admin sign-in");
  console.log(`    email:    ${admin.email}`);
  console.log(`    password: ${DEMO_PASSWORD}`);
  console.log("");
  console.log("  This password is shown once and is not stored anywhere in plain text.");
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log("  It was generated for this run. Set SEED_ADMIN_PASSWORD to pin it.");
  }
  console.log("  Never run this seed against a production database.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
