import type { NextAuthConfig } from "next-auth";
import { ADMIN_PREFIXES, PROTECTED_PREFIXES, routes } from "@/config/routes";

const MAX_AGE_DAYS = Number.parseInt(process.env.SESSION_MAX_AGE_DAYS ?? "30", 10);

/**
 * How long an unremembered session survives. Auth.js applies one global
 * `maxAge`, so "remember this device" is enforced in the jwt callback instead:
 * the cookie may live for 30 days, but a token issued without `remember` is
 * rejected after a day and the reader is signed out.
 */
const UNREMEMBERED_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Edge-safe Auth.js config: no Prisma, no bcrypt, no Node built-ins.
 * `middleware.ts` imports this file only; the full config in ./index.ts
 * extends it with the credentials provider and database access.
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: MAX_AGE_DAYS * 24 * 60 * 60 },
  pages: {
    signIn: routes.auth.login,
    error: routes.auth.login,
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-vantage.session" : "vantage.session",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [],
  callbacks: {
    /** Copy role and id onto the token at sign-in so pages avoid a DB hit. */
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.username = user.username;
        token.remember = user.remember ?? false;
        token.issuedAt = Math.floor(Date.now() / 1000);
      }

      // `update()` after a profile edit refreshes the token without a re-login.
      if (trigger === "update" && session?.user) {
        if (typeof session.user.name === "string") token.name = session.user.name;
        if (typeof session.user.username === "string") token.username = session.user.username;
        if (typeof session.user.image === "string" || session.user.image === null) {
          token.picture = session.user.image;
        }
      }

      // Short-lived session for a device the reader chose not to remember.
      const issuedAt = typeof token.issuedAt === "number" ? token.issuedAt : 0;
      const age = Math.floor(Date.now() / 1000) - issuedAt;
      if (!token.remember && issuedAt > 0 && age > UNREMEMBERED_MAX_AGE_SECONDS) {
        return null;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role;
        session.user.username = token.username;
      }
      return session;
    },
    /** Route-level gate evaluated by middleware before a page renders. */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isSignedIn = Boolean(auth?.user);
      const role = auth?.user?.role;

      if (ADMIN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return isSignedIn && (role === "ADMIN" || role === "MODERATOR");
      }
      if (PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return isSignedIn;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
