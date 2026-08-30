import { DeleteAccountForm } from "./delete-form";
import { requireUser } from "@/lib/auth/guards";
import { getAccountSummary } from "@/server/services/account-service";
import { EmptyState } from "@/components/ui/states";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Delete account",
  path: routes.account.delete,
  noIndex: true,
});

export default async function DeleteAccountPage() {
  const session = await requireUser(routes.account.delete);
  const account = await getAccountSummary(session.id);

  if (!account) {
    return (
      <EmptyState
        title="Account unavailable"
        description="We couldn't load your details just now. Try again in a moment."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        trail={[
          { label: "Settings", href: routes.account.settings },
          { label: "Delete account", href: routes.account.delete },
        ]}
      />

      <header className="space-y-1">
        <h1 className="font-display text-page font-semibold text-critical">Delete account</h1>
        <p className="max-w-xl text-meta text-ink-muted">
          If you only want to stop history being recorded, you can turn that off in settings instead
          — no need to delete anything.
        </p>
      </header>

      <DeleteAccountForm email={account.email} />

      {/*
        Stated plainly rather than implied: this removes the row immediately.
        A grace period and a data export are the next pieces of work.
      */}
      <p className="max-w-xl text-2xs text-ink-faint">
        Deletion currently takes effect immediately. A recovery window and a downloadable copy of
        your own data are planned but not yet built.
      </p>
    </div>
  );
}
