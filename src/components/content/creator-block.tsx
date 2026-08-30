import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { routes } from "@/config/routes";
import { pluralize } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { CreatorSummary } from "@/types/content";

/**
 * Compact contributor identity block. Used on the detail page sidebar and
 * anywhere else a recording needs to name who deposited it.
 */
export function CreatorBlock({
  creator,
  className,
}: {
  creator: CreatorSummary;
  className?: string;
}) {
  return (
    <div className={cn("rounded-card border border-line bg-surface p-4", className)}>
      <p className="slate mb-3">Contributor</p>

      <Link
        href={routes.creator(creator.slug)}
        className="group flex items-center gap-3 rounded-control"
      >
        <Avatar name={creator.name} src={creator.avatarUrl} size="md" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-display text-card font-semibold text-ink transition-colors group-hover:text-accent">
              {creator.name}
            </span>
            {creator.isVerified ? (
              <>
                <BadgeCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
                <span className="sr-only">Verified contributor</span>
              </>
            ) : null}
          </span>
          <span className="slate mt-0.5 block tabular-nums">
            {pluralize(creator.contentCount, "recording")}
          </span>
        </span>
      </Link>
    </div>
  );
}
