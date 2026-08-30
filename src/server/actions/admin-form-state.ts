/**
 * Shared client/server form-state shape for admin mutations.
 *
 * Deliberately not in a "use server" file: Next.js requires every export of a
 * server-action file to be an async function, and this constant is imported
 * directly by client components (the useActionState initial value). Keeping
 * it here — where no directive applies — is what makes that legal.
 */
export type AdminFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialAdminState: AdminFormState = { status: "idle" };
