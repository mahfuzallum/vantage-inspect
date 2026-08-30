import Link from "next/link";
import { ResetPasswordForm } from "./reset-form";
import { Button } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Choose a new password",
  path: routes.auth.resetPassword(),
  noIndex: true,
});

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = (raw ?? "").trim();

  // Shape check only. Whether the token is real, unexpired and unused is
  // decided on the server when it is consumed — never here.
  if (token.length < 20) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="slate slate-accent">Account</p>
          <h1 className="font-display text-page font-semibold">This link isn&apos;t valid</h1>
          <p className="text-meta text-ink-muted">
            Reset links expire after 30 minutes and can only be used once. Request a fresh one to
            continue.
          </p>
        </div>

        <Button asChild className="w-full" size="lg">
          <Link href={routes.auth.forgotPassword}>Request a new link</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="slate slate-accent">Account</p>
        <h1 className="font-display text-page font-semibold">Choose a new password</h1>
        <p className="text-meta text-ink-muted">
          Setting a new password signs you out on every other device.
        </p>
      </div>

      <ResetPasswordForm token={token} />
    </div>
  );
}
