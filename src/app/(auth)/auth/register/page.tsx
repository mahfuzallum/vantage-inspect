import { redirect } from "next/navigation";
import { RegisterForm } from "./register-form";
import { currentUser } from "@/lib/auth/guards";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Create an account",
  path: routes.auth.register,
  noIndex: true,
});

export default async function RegisterPage() {
  if (await currentUser()) redirect(routes.account.root);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="slate slate-accent">Account</p>
        <h1 className="font-display text-page font-semibold">Create an account</h1>
        <p className="text-meta text-ink-muted">
          An account lets you save recordings and pick up where you left off.
        </p>
      </div>

      <RegisterForm />
    </div>
  );
}
