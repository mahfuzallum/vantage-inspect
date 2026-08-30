import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SearchBar } from "@/components/layout/search-bar";
import { routes } from "@/config/routes";
import { CountUp } from "./count-up";
import type { CategorySummary } from "@/types/content";

export type HomeHeroProps = {
  categories: CategorySummary[];
  totalRecordings: number;
  /** Administrator-editable copy. Defaults live in the settings service. */
  copy: { heroTitle: string; heroDescription: string; quickLinks: string[] };
};

/**
 * Two labels are routes rather than searches, so they keep working as the
 * dedicated pages they are. Everything else becomes a search for its own text.
 */
function hrefForQuickLink(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized === "popular") return routes.popular;
  if (normalized === "new releases" || normalized === "latest") return routes.latest;
  return routes.search(label.trim());
}

export function HomeHero({ totalRecordings, copy }: HomeHeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.07] bg-[#08080D]">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:56px_56px]" />
      <div
        aria-hidden="true"
        className="animate-ambient pointer-events-none absolute left-1/2 top-[-20rem] h-[34rem] w-[48rem] -translate-x-1/2 rounded-full bg-[#8B5CF6]/[0.18] blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="animate-ambient-slow pointer-events-none absolute left-[62%] top-[-14rem] h-[26rem] w-[30rem] rounded-full bg-[#EC4899]/[0.08] blur-[110px]"
      />
      <Container className="relative pb-10 pt-14 sm:pb-12 sm:pt-20">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#8B5CF6]/25 bg-[#8B5CF6]/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C4B5FD]">
            <Sparkles className="size-3.5" aria-hidden="true" />
            <CountUp value={totalRecordings} /> recordings indexed
          </div>

          <h1 className="mt-5 font-display text-4xl font-bold tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
            {copy.heroTitle}
          </h1>

          {copy.heroDescription ? (
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/55 sm:text-base">
              {copy.heroDescription}
            </p>
          ) : null}

          <div className="mx-auto mt-7 max-w-3xl rounded-2xl border border-white/[0.08] bg-white/[0.035] p-2 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur">
            <SearchBar
              size="large"
              className="w-full"
              placeholder="Search videos, creators, platforms..."
            />
          </div>

          {copy.quickLinks.length > 0 ? (
            <nav aria-label="Quick browse" className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {copy.quickLinks.map((label) => (
                <Link
                  key={label}
                  href={hrefForQuickLink(label)}
                  className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3.5 py-1.5 text-xs text-white/55 transition hover:border-[#8B5CF6]/50 hover:bg-[#8B5CF6]/10 hover:text-[#C4B5FD]"
                >
                  #{label}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
