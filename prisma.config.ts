import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma configuration.
 *
 * Moved out of `package.json#prisma`, which is deprecated and removed in
 * Prisma 7. Keeping it here also means the seed command is declared in one
 * place that both the CLI and the docs point at.
 *
 * IMPORTANT: as soon as this file exists, the Prisma CLI stops loading `.env`
 * on its own ("Prisma config detected, skipping environment variable
 * loading" in its output) and expects this file to do it instead. Without
 * the block below, `prisma generate`/`db push`/`migrate`/`db seed` would all
 * fail with "Environment variable not found: DATABASE_URL" even with a
 * perfectly correct `.env` sitting right next to this file. `next dev` is
 * unaffected — Next.js loads `.env` itself — so this gap only ever showed up
 * running Prisma commands directly from the CLI.
 */
loadDotEnv();

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});

function loadDotEnv(): void {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;

    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // A variable already set in the real environment wins over the file —
    // the same precedence dotenv-style loaders use everywhere else.
    if (!(key in process.env)) process.env[key] = value;
  }
}
