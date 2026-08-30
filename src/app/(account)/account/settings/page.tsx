import Link from "next/link";
import { EmailForm, PasswordForm, PreferencesForm, ProfileForm } from "./settings-forms";
import { requireUser } from "@/lib/auth/guards";
import {
  getAccountSummary,
  getPreferences,
  pendingEmailChange,
} from "@/server/services/account-service";
import { EmptyState } from "@/components/ui/states";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Settings",
  path: routes.account.settings,
  noIndex: true,
});

export default async function SettingsPage() {
  const session = await requireUser(routes.account.settings);

  const [account, preferences, pending] = await Promise.all([
    getAccountSummary(session.id),
    getPreferences(session.id),
    pendingEmailChange(session.id),
  ]);

  if (!account) {
    return (
      <EmptyState
        title="Settings unavailable"
        description="We couldn't load your details just now. Try again in a moment."
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-page font-semibold">Settings</h1>
        <p className="text-meta text-ink-muted">Your profile, sign-in details and preferences.</p>
      </header>

      <ProfileForm
        displayName={account.displayName}
        username={account.username}
        bio={account.bio}
      />

      <EmailForm currentEmail={account.email} pending={pending} />

      <PasswordForm />

      <PreferencesForm
        values={{
          autoplay: preferences?.autoplay ?? false,
          keepHistory: preferences?.keepHistory ?? true,
          emailNotifications: preferences?.emailNotifications ?? true,
          itemsPerPage: preferences?.itemsPerPage ?? 24,
        }}
      />

      <section
        aria-labelledby="danger-zone"
        className="rounded-panel border border-critical/30 bg-critical/5 p-5"
      >
        <h2 id="danger-zone" className="font-display text-section font-semibold text-critical">
          Delete account
        </h2>
        <p className="mt-1 max-w-xl text-meta text-ink-muted">
          Permanently removes your profile, saved recordings and history. This cannot be undone.
        </p>
        <Link
          href={routes.account.delete}
          className="mt-4 inline-flex text-sm text-critical underline-offset-4 hover:underline"
        >
          Continue to deletion
        </Link>
      </section>
    </div>
  );
}
