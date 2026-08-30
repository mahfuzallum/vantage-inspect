import Link from "next/link";
import { Bookmark, Clock, Settings, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/guards";
import { getAccountSummary } from "@/server/services/account-service";
import { formatDate, pluralize } from "@/lib/utils/format";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Your account",
  path: routes.account.root,
  noIndex: true,
});

export default async function AccountPage() {
  const session = await requireUser(routes.account.root);
  // Read by id from the session — never from a query parameter.
  const account = await getAccountSummary(session.id);

  if (!account) {
    return (
      <EmptyState
        title="Account unavailable"
        description="We couldn't load your details just now. Try again in a moment."
      />
    );
  }

  const quickLinks = [
    {
      href: routes.account.favorites,
      icon: Bookmark,
      label: "Saved",
      value: pluralize(account.favoriteCount, "recording"),
    },
    {
      href: routes.account.history,
      icon: Clock,
      label: "History",
      value: pluralize(account.historyCount, "recording"),
    },
    {
      href: routes.account.settings,
      icon: Settings,
      label: "Settings",
      value: "Profile, password, preferences",
    },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-page font-semibold">Overview</h1>
        <p className="text-meta text-ink-muted">Your profile and what you&apos;ve kept.</p>
      </header>

      <section
        aria-labelledby="profile-summary"
        className="rounded-panel border border-line bg-surface p-5"
      >
        <h2 id="profile-summary" className="slate mb-4">
          Profile
        </h2>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={account.displayName} src={account.avatarUrl} size="xl" />

          <dl className="min-w-0 flex-1 space-y-2">
            <div>
              <dt className="sr-only">Display name</dt>
              <dd className="font-display text-section font-semibold text-ink">
                {account.displayName}
              </dd>
            </div>
            <div>
              <dt className="sr-only">Username</dt>
              <dd className="slate">@{account.username}</dd>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-ink-muted">
              <div className="flex gap-1.5">
                <dt>Email</dt>
                <dd className="text-ink">{account.email}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Member since</dt>
                <dd className="text-ink">
                  <time dateTime={account.createdAt.toISOString()}>
                    {formatDate(account.createdAt)}
                  </time>
                </dd>
              </div>
            </div>
            {account.bio ? (
              <div>
                <dt className="sr-only">Bio</dt>
                <dd className="max-w-xl text-meta leading-relaxed text-ink-muted">{account.bio}</dd>
              </div>
            ) : null}
          </dl>

          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={routes.account.settings}>
              <User className="size-3.5" aria-hidden="true" />
              Edit profile
            </Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="quick-links" className="space-y-3">
        <h2 id="quick-links" className="slate">
          Shortcuts
        </h2>

        <div className="grid gap-3 sm:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-card border border-line bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-raised"
            >
              <span className="flex items-center gap-2">
                <link.icon
                  className="size-4 text-ink-faint transition-colors group-hover:text-accent"
                  aria-hidden="true"
                />
                <span className="font-display text-card font-semibold text-ink group-hover:text-accent-strong">
                  {link.label}
                </span>
              </span>
              <span className="slate mt-1.5 block">{link.value}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
