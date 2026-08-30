import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { currentUser } from "@/lib/auth/guards";
import { safeRedirectPath } from "@/lib/security/sanitize";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Sign in",
  description: "Sign in to save recordings and keep your viewing history.",
  path: routes.auth.login,
  noIndex: true,
});

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  // Already signed in? Nothing to do here.
  if (await currentUser()) redirect(routes.account.root);

  const raw = Array.isArray(params.callbackUrl) ? params.callbackUrl[0] : params.callbackUrl;
  const callbackUrl = safeRedirectPath(raw, routes.account.root);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="slate slate-accent">Account</p>
        <h1 className="font-display text-page font-semibold">Sign in</h1>
        <p className="text-meta text-ink-muted">
          Saved recordings and viewing history are kept with your account.
        </p>
      </div>

      <LoginForm callbackUrl={callbackUrl} passwordChanged={params.passwordChanged === "1"} />
    </div>
  );
}
