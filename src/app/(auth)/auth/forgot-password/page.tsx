import { ForgotPasswordForm } from "./forgot-form";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Reset your password",
  path: routes.auth.forgotPassword,
  noIndex: true,
});

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="slate slate-accent">Account</p>
        <h1 className="font-display text-page font-semibold">Reset your password</h1>
        <p className="text-meta text-ink-muted">
          Enter the address on your account and we&apos;ll send a link to set a new password.
        </p>
      </div>

      <ForgotPasswordForm />
    </div>
  );
}
