import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";
import { GUEST_ONLY_PREFIXES, routes } from "@/config/routes";

/**
 * Edge middleware. Uses the Prisma-free auth config so it stays within the
 * Edge runtime's constraints; the `authorized` callback decides access.
 */
const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const { nextUrl } = request;
  const isSignedIn = Boolean(request.auth?.user);

  // Signed-in readers have no use for the sign-in and register screens.
  if (isSignedIn && GUEST_ONLY_PREFIXES.some((prefix) => nextUrl.pathname.startsWith(prefix))) {
    return NextResponse.redirect(new URL(routes.account.root, nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Skip static assets and image optimisation so they never pay auth cost.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|uploads|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico)$).*)",
  ],
};
