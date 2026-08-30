import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { routes } from "@/config/routes";
import { pluralize } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { CreatorSummary } from "@/types/content";

export type CreatorCardProps = {
  creator: CreatorSummary;
  /** Optional second metadata line, e.g. the creator's main subject. */
  detail?: string;
  className?: string;
};

export function CreatorCard({ creator, detail, className }: CreatorCardProps) {
  return (
    <article
      className={cn(
        "group relative flex items-center gap-3 rounded-card border border-line",
        "bg-surface p-4 transition-colors",
        "hover:border-line-strong hover:bg-raised focus-within:border-line-strong",
        className,
      )}
    >
      <Avatar name={creator.name} src={creator.avatarUrl} size="lg" />

      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-1.5 font-display text-card font-semibold text-ink">
          <Link
            href={routes.creator(creator.slug)}
            className="truncate after:absolute after:inset-0 group-hover:text-accent-strong"
          >
            {creator.name}
          </Link>
          {creator.isVerified ? (
            <>
              <BadgeCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="sr-only">Verified contributor</span>
            </>
          ) : null}
        </h3>

        <p className="slate mt-1.5 tabular-nums">{pluralize(creator.contentCount, "recording")}</p>
        {detail ? <p className="mt-1 truncate text-meta text-ink-faint">{detail}</p> : null}
      </div>
    </article>
  );
}
