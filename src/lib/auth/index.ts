import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";
import { credentialsSchema } from "@/validation/auth";
import { authConfig } from "./config";

/**
 * Full Auth.js instance (Node runtime). Adding an OAuth provider later is a
 * one-line change here — the Account table already exists for it.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { label: "Remember this device", type: "checkbox" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            role: true,
            isActive: true,
            passwordHash: true,
          },
        });

        // Always run the comparison, even for a missing user, to keep the
        // response time uniform and avoid leaking which emails exist.
        const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? null);
        if (!user || !valid || !user.isActive) return null;

        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          image: user.avatarUrl,
          username: user.username,
          role: user.role,
          remember: raw?.remember === "true" || raw?.remember === true,
        };
      },
    }),
    /**
     * Unlock-code sign-in.
     *
     * A shortcut into the admin area for the person running the site: five
     * taps on the wordmark, then a code. The code is verified *here* rather
     * than by whatever calls signIn, so there is no path that accepts an
     * already-decided user id — the only way through is the code itself.
     *
     * Stored hashed and compared with the same bcrypt routine as a password,
     * so database access does not reveal it, and rate limiting sits in front
     * of the action that calls this.
     */
    Credentials({
      id: "unlock-code",
      name: "Unlock code",
      credentials: { code: { label: "Code", type: "password" } },
      async authorize(raw) {
        const code = typeof raw?.code === "string" ? raw.code.trim() : "";
        if (code.length < 6) return null;

        const setting = await db.siteSetting.findUnique({
          where: { key: "adminUnlockCode" },
          select: { value: true },
        });

        let hash = typeof setting?.value === "string" ? setting.value : null;

        // First use: adopt the value from the environment and persist it
        // hashed, so the plaintext never reaches the database.
        if (!hash) {
          const seed = process.env.ADMIN_UNLOCK_CODE;
          if (seed && seed.length >= 6) {
            hash = await hashPassword(seed);
            await db.siteSetting.upsert({
              where: { key: "adminUnlockCode" },
              create: { key: "adminUnlockCode", value: hash, group: "security" },
              update: { value: hash },
            });
          }
        }

        // Run the comparison even with nothing configured, so an unconfigured
        // site and a wrong code take the same time to answer.
        const valid = await verifyPassword(code, hash);
        if (!hash || !valid) return null;

        // The code grants the primary administrator account; there is no
        // separate identity behind it, so actions stay attributable.
        const admin = await db.user.findFirst({
          where: { role: "ADMIN", isActive: true },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            role: true,
          },
        });
        if (!admin) return null;

        await db.user.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

        return {
          id: admin.id,
          email: admin.email,
          name: admin.displayName,
          image: admin.avatarUrl,
          username: admin.username,
          role: admin.role,
          remember: false,
        };
      },
    }),
  ],
});
