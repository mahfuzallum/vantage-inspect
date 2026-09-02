import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Bookmark, CalendarDays, Clock, Eye, FileQuestion, Loader2 } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { RelatedContentSkeleton } from "@/components/ui/skeleton";
import { ContentPlayer } from "@/components/content/content-player";
import { ContentGrid } from "@/components/content/content-grid";
import { CreatorBlock } from "@/components/content/creator-block";
import { TagBadge } from "@/components/content/tag-badge";
import { FavoriteButton } from "@/components/actions/favorite-button";
import { ShareButton } from "@/components/actions/share-button";
import { ReportButton } from "@/components/actions/report-button";
import { DemoNotice } from "@/components/home/demo-notice";
import {
  findContentBySlug,
  findCreatorContent,
  findRelated,
} from "@/server/services/discovery-service";
import { checkFavoriteStatus } from "@/server/actions/favorites";
import { currentUser } from "@/lib/auth/guards";
import { formatCount, formatDate, formatDuration, pluralize } from "@/lib/utils/format";
import { absoluteUrl, buildMetadata } from "@/lib/seo/metadata";
import { breadcrumbJsonLd, jsonLdScript, videoObjectJsonLd } from "@/lib/seo/structured-data";
import { routes } from "@/config/routes";
import { MonetizationSlot } from "@/components/monetization-slot";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const found = await findContentBySlug(slug);

  if (!found) {
    return buildMetadata({
      title: "Recording not found",
      path: routes.content(slug),
      noIndex: true,
    });
  }

  const { content } = found;
  return buildMetadata({
    title: content.seoTitle ?? content.title,
    description: content.seoDescription ?? content.summary,
    path: routes.content(content.slug),
    image: content.ogImageUrl ?? content.thumbnailUrl,
    type: "article",
    publishedTime: content.publishedAt,
  });
}

export default async function ContentDetailPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const user = await currentUser();

  /*
    Preview mode. The query string only expresses intent — whether an
    unpublished record is actually returned is decided by the session role, so
    a visitor appending ?preview=1 sees exactly what they saw before.
  */
  const staff = user?.role === "ADMIN" || user?.role === "MODERATOR";
  const wantsPreview = query.preview === "1" && staff;

  const found = await findContentBySlug(slug, wantsPreview);

  // Unknown slug -> framework 404. No database detail reaches the reader.
  if (!found) notFound();

  const { content, isDemo } = found;
  const isPreview = wantsPreview && content.status !== "PUBLISHED";

  // Related and creator rails are non-critical: if either query fails the page
  // still renders, it just shows fewer sections.
  const [related, creatorContent, initialSaved] = await Promise.all([
    findRelated(content, 8),
    content.creator ? findCreatorContent(content.creator.slug, 4, content.slug) : [],
    user ? checkFavoriteStatus(content.id) : false,
  ]);

  const path = routes.content(content.slug);
  const shareUrl = absoluteUrl(path);

  const trail = [
    ...(content.category
      ? [{ label: content.category.name, href: routes.category(content.category.slug) }]
      : []),
    { label: content.title, href: path },
  ];

  return (
    <>
      {isDemo ? <DemoNotice /> : null}

      {isPreview ? (
        <div className="border-b border-caution/40 bg-caution/10">
          <Container className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm text-caution">
            <span className="font-medium">Preview</span>
            <span className="text-caution/80">
              This recording is {content.status.toLowerCase()} and is not visible to visitors.
            </span>
            <Link
              href={routes.admin.contentEdit(content.id)}
              className="ml-auto shrink-0 underline underline-offset-2"
            >
              Edit it
            </Link>
          </Container>
        </div>
      ) : null}

      <Container className="py-6 sm:py-8">
        <Breadcrumbs trail={[{ label: "Home", href: routes.home }, ...trail]} className="mb-4" />

        {content.playback === "processing" ? (
          <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-sunken text-center">
            <Loader2 className="size-7 animate-spin text-accent" aria-hidden="true" />
            <p className="font-display text-card font-semibold text-ink">
              This recording is being processed
            </p>
            <p className="max-w-sm text-meta text-ink-muted">
              Transcoding usually takes a few minutes. Check back shortly.
            </p>
          </div>
        ) : content.playback === "unavailable" ? (
          <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-sunken text-center">
            <FileQuestion className="size-7 text-ink-faint" aria-hidden="true" />
            <p className="font-display text-card font-semibold text-ink">
              This recording is currently unavailable
            </p>
            <p className="max-w-sm text-meta text-ink-muted">
              Report it if you think that&apos;s a mistake.
            </p>
          </div>
        ) : (
          <ContentPlayer
            contentId={content.id}
            kind={content.kind}
            src={content.mediaUrl}
            hlsSrc={content.hlsUrl}
            poster={content.thumbnailUrl}
            title={content.title}
          />
        )}

        <MonetizationSlot type="nativeBanner" placement="video" />
        <MonetizationSlot type="banner" placement="video" />

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-6">
            <div className="space-y-3">
              <h1 className="font-display text-page font-semibold sm:text-3xl">{content.title}</h1>

              {/* Metadata slate — the interface's recurring device. */}
              <div className="slate flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="size-3" aria-hidden="true" />
                  <span className="tabular-nums">{formatCount(content.viewCount)} views</span>
                </span>

                {content.durationSeconds ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3" aria-hidden="true" />
                    <span className="tabular-nums">{formatDuration(content.durationSeconds)}</span>
                  </span>
                ) : null}

                {content.publishedAt ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3" aria-hidden="true" />
                    <time dateTime={content.publishedAt.toISOString()}>
                      {formatDate(content.publishedAt)}
                    </time>
                  </span>
                ) : null}

                {content.isFeatured ? <Badge tone="accent">Featured</Badge> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-2 border-y border-line py-3">
              <FavoriteButton
                contentId={content.id}
                initialSaved={initialSaved}
                isSignedIn={Boolean(user)}
                returnTo={path}
              />
              <ShareButton
                url={shareUrl}
                title={content.title}
                text={content.summary ?? undefined}
              />
              <ReportButton contentId={content.id} />
            </div>

            {content.description ? (
              <div className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">
                {content.description}
              </div>
            ) : null}

            {content.tags.length > 0 ? (
              <div className="space-y-2 border-t border-line pt-5">
                <h2 className="slate">Topics</h2>
                <ul className="flex flex-wrap gap-2">
                  {content.tags.map((tag) => (
                    <li key={tag.id}>
                      <TagBadge tag={tag} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <aside className="space-y-5">
            {content.creator ? <CreatorBlock creator={content.creator} /> : null}

            {content.category ? (
              <div className="rounded-card border border-line bg-surface p-4">
                <h2 className="slate mb-2">Filed under</h2>
                <Link
                  href={routes.category(content.category.slug)}
                  className="font-display text-card font-semibold text-ink transition-colors hover:text-accent"
                >
                  {content.category.name}
                </Link>
              </div>
            ) : null}

            <div className="rounded-card border border-line bg-surface p-4">
              <h2 className="slate mb-3">Statistics</h2>
              <dl className="space-y-2 text-meta">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-muted">Views</dt>
                  <dd className="tabular-nums text-ink">{content.viewCount.toLocaleString()}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-1.5 text-ink-muted">
                    <Bookmark className="size-3" aria-hidden="true" />
                    Saves
                  </dt>
                  <dd className="tabular-nums text-ink">
                    {content.favoriteCount.toLocaleString()}
                  </dd>
                </div>
                {content.recordedAt ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Recorded</dt>
                    <dd className="text-ink">
                      <time dateTime={content.recordedAt.toISOString()}>
                        {formatDate(content.recordedAt)}
                      </time>
                    </dd>
                  </div>
                ) : null}
                {content.language ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Language</dt>
                    <dd className="uppercase text-ink">{content.language}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </aside>
        </div>
      </Container>

      {content.creator && creatorContent.length > 0 ? (
        <Container as="section" aria-labelledby="more-from" className="pb-14">
          <SectionHeader
            id="more-from"
            eyebrow="Contributor"
            title={`More from ${content.creator.name}`}
            action={{ label: "View all", href: routes.creator(content.creator.slug) }}
          />
          <Suspense fallback={<RelatedContentSkeleton />}>
            <ContentGrid className="mt-6" items={creatorContent} priorityCount={0} />
          </Suspense>
        </Container>
      ) : null}

      {related.length > 0 ? (
        <Container as="section" aria-labelledby="related" className="pb-16">
          <SectionHeader
            id="related"
            eyebrow="Related"
            title="Similar recordings"
            description={
              content.creator
                ? `Ranked by shared contributor, topic and subject — ${pluralize(related.length, "match")}.`
                : undefined
            }
          />
          <Suspense fallback={<RelatedContentSkeleton />}>
            <ContentGrid className="mt-6" items={related} priorityCount={0} />
          </Suspense>
        </Container>
      ) : null}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(videoObjectJsonLd(content)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(breadcrumbJsonLd([{ label: "Home", href: routes.home }, ...trail])),
        }}
      />
    </>
  );
}
