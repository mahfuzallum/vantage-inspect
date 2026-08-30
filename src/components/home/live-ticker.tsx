"use client";

import Link from "next/link";
import { routes } from "@/config/routes";
import { formatRelativeTime } from "@/lib/utils/format";

export type TickerItem = {
  id: string;
  title: string;
  slug: string;
  creatorName: string | null;
  addedAt: string;
};

/**
 * Continuously scrolling strip of the newest additions.
 *
 * The list is duplicated once and the track translated by exactly -50%, which
 * is what makes the loop seamless: the second copy is in frame at the moment
 * the first scrolls out. The duplicate is hidden from assistive technology so
 * a screen reader hears each recording once.
 *
 * Paused on hover so the links can actually be clicked, and CSS-driven rather
 * than JS so it costs nothing on the main thread and stops automatically
 * under `prefers-reduced-motion`.
 */
export function LiveTicker({ items }: { items?: TickerItem[] }) {
  // Decorative strip: if the data is missing or malformed it renders nothing
  // rather than taking the page down with it.
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className="relative overflow-hidden border-y border-white/[0.06] bg-[#0B0B12]/60 py-2.5 backdrop-blur">
      {/* Fades the strip into the page edges instead of cutting it off. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#08080D] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#08080D] to-transparent" />

      <div className="flex items-center gap-3">
        <span className="z-20 ml-4 flex shrink-0 items-center gap-2 rounded-full border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 px-3 py-1">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#A78BFA] opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[#A78BFA]" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#C4B5FD]">
            Live
          </span>
        </span>

        <div className="group flex-1 overflow-hidden">
          <div className="animate-marquee flex w-max items-center gap-8 group-hover:[animation-play-state:paused]">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center gap-8" aria-hidden={copy === 1}>
                {items.map((item) => (
                  <Link
                    key={`${copy}-${item.id}`}
                    href={routes.content(item.slug)}
                    className="flex shrink-0 items-center gap-2 text-xs text-white/45 transition-colors hover:text-[#C4B5FD]"
                  >
                    <span className="size-1 rounded-full bg-[#8B5CF6]/50" aria-hidden="true" />
                    <span className="max-w-[22rem] truncate">{item.title}</span>
                    {item.creatorName ? (
                      <span className="text-white/25">· {item.creatorName}</span>
                    ) : null}
                    <span className="font-mono text-[10px] text-white/20">
                      {formatRelativeTime(item.addedAt)}
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
