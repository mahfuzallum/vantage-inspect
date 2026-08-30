import Link from "next/link";
import { PasswordForm } from "../settings-forms";
import { requireUser } from "@/lib/auth/guards";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Change your password",
  path: routes.account.password,
  noIndex: true,
});

/**
 * The password form on its own page.
 *
 * `routes.account.password` was already linked from elsewhere in the app but
 * had no page behind it. The form is the same component the settings page
 * renders — there is one implementation, not two that can drift.
 */
export default async function PasswordSettingsPage() {
  await requireUser(routes.account.password);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href={routes.account.settings} className="slate hover:text-accent">
          ← Settings
        </Link>
        <h1 className="font-display text-page font-semibold">Password</h1>
      </div>

      <PasswordForm />
    </div>
  );
}
