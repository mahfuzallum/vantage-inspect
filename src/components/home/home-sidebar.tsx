import Link from "next/link";
import { Compass, Flame, Heart, Search, Star } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { routes } from "@/config/routes";
import { formatCount, formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { CreatorSummary } from "@/types/content";

export type SidebarCreator = CreatorSummary & {
  lastAddedAt?: Date | null;
};

/**
 * Compact contributor rail.
 *
 * The sidebar stays intentionally narrow so the Home video grid
 * gets most of the available horizontal space.
 */
export function HomeSidebar({
  recent,
  popular,
  className,
}: {
  recent: SidebarCreator[];
  popular: SidebarCreator[];
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "hidden w-48 shrink-0 border-r border-white/[0.06] bg-[#0B0B12]/70 xl:block",
        className,
      )}
    >
      <div
        className="
          sticky
          top-16
          max-h-[calc(100dvh-4rem)]
          overflow-y-auto
          px-2.5
          py-4
          [scrollbar-width:thin]
        "
      >
        {/* Search */}
        <Link
          href={routes.search()}
          className="
            flex
            items-center
            gap-2
            rounded-lg
            border
            border-white/[0.07]
            bg-white/[0.025]
            px-3
            py-2
            text-[11px]
            text-white/40
            transition-colors
            duration-150
            hover:border-[#8B5CF6]/35
            hover:bg-white/[0.04]
            hover:text-white/70
          "
        >
          <Search
            className="size-3.5 shrink-0"
            aria-hidden="true"
          />

          <span className="truncate">
            Search models…
          </span>
        </Link>

        {/* Navigation */}
        <nav
          className="mt-3 space-y-0.5"
          aria-label="Browse"
        >
          <RailLink
            href={routes.home}
            icon={Compass}
            label="Explore"
          />

          <RailLink
            href={routes.popular}
            icon={Flame}
            label="Popular"
          />

          <RailLink
            href={routes.featured}
            icon={Star}
            label="Featured"
          />

          <RailLink
            href={routes.account.favorites}
            icon={Heart}
            label="Saved"
          />
        </nav>

        {/* Recently added */}
        {recent.length > 0 ? (
          <CreatorSection
            title="Recently added"
            count={recent.length}
            live
            creators={recent}
            meta={(creator) =>
              creator.lastAddedAt
                ? formatRelativeTime(
                    creator.lastAddedAt,
                  )
                : ""
            }
          />
        ) : null}

        {/* Popular */}
        {popular.length > 0 ? (
          <CreatorSection
            title="Popular models"
            creators={popular}
            meta={(creator) =>
              `${formatCount(
                creator.contentCount,
              )} ${
                creator.contentCount === 1
                  ? "video"
                  : "videos"
              }`
            }
          />
        ) : null}
      </div>
    </aside>
  );
}

function RailLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Compass;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="
        flex
        items-center
        gap-2
        rounded-md
        px-2
        py-1.5
        text-[12px]
        text-white/50
        transition-colors
        duration-150
        hover:bg-white/[0.04]
        hover:text-white
      "
    >
      <Icon
        className="size-3.5 shrink-0 text-white/30"
        aria-hidden="true"
      />

      <span className="truncate">
        {label}
      </span>
    </Link>
  );
}

function CreatorSection({
  title,
  count,
  live = false,
  creators,
  meta,
}: {
  title: string;
  count?: number;
  live?: boolean;
  creators: SidebarCreator[];
  meta: (creator: SidebarCreator) => string;
}) {
  return (
    <section className="mt-5">
      <h2
        className="
          flex
          items-center
          gap-1.5
          px-2
          pb-1.5
          text-[9px]
          font-semibold
          uppercase
          tracking-[0.12em]
          text-white/30
        "
      >
        {live ? (
          <span className="relative flex size-1.5 shrink-0">
            <span
              className="
                absolute
                inline-flex
                size-full
                animate-ping
                rounded-full
                bg-emerald-400
                opacity-60
              "
            />

            <span
              className="
                relative
                inline-flex
                size-1.5
                rounded-full
                bg-emerald-400
              "
            />
          </span>
        ) : null}

        <span className="truncate">
          {title}
        </span>

        {count ? (
          <span className="shrink-0 text-white/15">
            · {count}
          </span>
        ) : null}
      </h2>

      <ul className="space-y-0.5">
        {creators.map((creator) => (
          <li key={creator.id}>
            <Link
              href={routes.creator(
                creator.slug,
              )}
              className="
                group
                flex
                min-w-0
                items-center
                gap-2
                rounded-md
                px-2
                py-1.5
                transition-colors
                duration-150
                hover:bg-white/[0.04]
              "
            >
              <Avatar
                name={creator.name}
                src={creator.avatarUrl}
                size="sm"
                className="
                  size-6
                  shrink-0
                  ring-1
                  ring-[#8B5CF6]/20
                "
              />

              <span className="min-w-0 flex-1">
                <span
                  className="
                    block
                    truncate
                    text-[11px]
                    leading-4
                    text-white/65
                    transition-colors
                    duration-150
                    group-hover:text-white
                  "
                >
                  {creator.name}
                </span>

                <span
                  className="
                    block
                    truncate
                    font-mono
                    text-[9px]
                    leading-3
                    text-white/20
                  "
                >
                  {meta(creator)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}