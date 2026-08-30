"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

/**
 * Session context for the few Client Components that need it (the user menu,
 * favourite buttons). Server Components read the session directly instead.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
