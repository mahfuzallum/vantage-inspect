import { logoutAction } from "@/server/actions/auth";
import { SubmitButton } from "@/components/forms/form-feedback";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Sign out",
  path: routes.auth.logout,
  noIndex: true,
});

/**
 * Signing out is a state change, so it goes through a POST form rather than a
 * link. A GET route would let any page or prefetch sign someone out.
 */
export default function LogoutPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="slate slate-accent">Account</p>
        <h1 className="font-display text-page font-semibold">Sign out?</h1>
        <p className="text-meta text-ink-muted">
          Your saved recordings and history stay on your account.
        </p>
      </div>

      <form action={logoutAction}>
        <SubmitButton className="w-full" size="lg" pendingLabel="Signing out…">
          Sign out
        </SubmitButton>
      </form>
    </div>
  );
}
