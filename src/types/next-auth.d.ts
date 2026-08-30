import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User {
    username: string;
    role: UserRole;
    /** Set at sign-in from the "remember this device" checkbox. */
    remember?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: UserRole;
    remember?: boolean;
    issuedAt?: number;
  }
}

// Auth.js v5 resolves the JWT type through @auth/core, so the same shape has
// to be declared there as well or callbacks see `unknown`.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: UserRole;
    remember?: boolean;
    issuedAt?: number;
  }
}

export {};
