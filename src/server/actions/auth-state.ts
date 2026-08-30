export type AuthFormState = {
  status: "idle" | "error" | "success";
  formError?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
};

export const initialAuthState: AuthFormState = { status: "idle" };
