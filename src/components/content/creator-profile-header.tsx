import { BadgeCheck, CalendarDays, Eye, Link2, Video } from "lucide-react";
import { SOCIAL_PLATFORMS } from "@/validation/admin";
import { Avatar } from "@/components/ui/avatar";
import { formatCount, formatDate, pluralize } from "@/lib/utils/format";
import { safeExternalUrl } from "@/lib/security/sanitize";
import { cn } from "@/lib/utils/cn";

export type CreatorProfileHeaderProps = {
  name: string;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  isVerified: boolean;
  contentCount: number;
  totalViews: number;
  joinedAt?: Date | null;
  websiteUrl?: string | null;
  socialLinks?: Record<string, string>;
  className?: string;
};

export function CreatorProfileHeader({
  name,
  avatarUrl,
  bannerUrl,
  bio,
  isVerified,
  contentCount,
  totalViews,
  joinedAt,
  websiteUrl,
  socialLinks = {},
  className,
}: CreatorProfileHeaderProps) {
  const website = safeExternalUrl(websiteUrl);
  let websiteHost: string | null = null;
  if (website) {
    try {
      websiteHost = new URL(website).hostname.replace(/^www\./, "");
    } catch {
      websiteHost = null;
    }
  }

  return (
    <aside className={cn("profile-rail", className)}>
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111118] shadow-[0_20px_60px_rgba(0,0,0,0.22),0_0_0_1px_rgba(139,92,246,0.06)]">
        <div
          className="h-24 bg-gradient-to-br from-[#8B5CF6]/35 via-[#181321] to-[#0d0d13]"
          style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        />
        <div className="px-5 pb-6">
          <div className="-mt-12">
            <Avatar name={name} src={avatarUrl} size="xl" className="size-24 border-4 border-[#111118] ring-1 ring-[#8B5CF6]/35" />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <h1 className="min-w-0 font-display text-2xl font-bold tracking-tight text-white">{name}</h1>
            {isVerified ? <BadgeCheck className="size-5 shrink-0 text-[#A78BFA]" aria-label="Verified" /> : null}
          </div>

          <p className="mt-1 text-sm text-white/40">Creator profile</p>

          {bio ? <p className="mt-4 text-sm leading-6 text-white/60">{bio}</p> : null}

          <dl className="mt-6 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
              <Video className="size-4 text-[#A78BFA]" aria-hidden="true" />
              <dt className="mt-2 text-[10px] uppercase tracking-[0.12em] text-white/30">Videos</dt>
              <dd className="mt-0.5 font-display text-base font-semibold text-white">{contentCount}</dd>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
              <Eye className="size-4 text-[#A78BFA]" aria-hidden="true" />
              <dt className="mt-2 text-[10px] uppercase tracking-[0.12em] text-white/30">Views</dt>
              <dd className="mt-0.5 font-display text-base font-semibold text-white">{formatCount(totalViews)}</dd>
            </div>
          </dl>

          <div className="mt-5 space-y-2 text-xs text-white/45">
            {joinedAt ? (
              <div className="flex items-center gap-2"><CalendarDays className="size-3.5" /> Since {formatDate(joinedAt)}</div>
            ) : null}
            {website && websiteHost ? (
              <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 hover:text-[#A78BFA]">
                <Link2 className="size-3.5" /> {websiteHost}
              </a>
            ) : null}
            <div className="text-white/30">{pluralize(contentCount, "recording")} in this archive</div>
          </div>

          {/* Only platforms with a real, checked address are rendered. */}
          <div className="mt-5 flex flex-wrap gap-2">
            {SOCIAL_PLATFORMS.map((platform) => {
              const href = safeExternalUrl(socialLinks[platform.key]);
              if (!href) return null;
              return (
                <a
                  key={platform.key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-white/55 transition hover:border-[#8B5CF6]/45 hover:bg-[#8B5CF6]/10 hover:text-[#C4B5FD]"
                >
                  {platform.label}
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
