import fs from "node:fs";
import path from "node:path";

/**
 * Pre-flight check for a local install.
 *
 * Every setup failure in this project so far has produced a stack trace that
 * names a symptom rather than the cause — "MissingSecret" for an absent
 * `.env`, "Environment variable not found: DATABASE_URL" for the same thing,
 * a Prisma validation error for one missing line. This reads the actual file
 * and says which line is wrong, before anything is started.
 *
 * Run with: npm run doctor
 */

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env");

type Check = { ok: boolean; label: string; detail?: string };
const checks: Check[] = [];

function pass(label: string) {
  checks.push({ ok: true, label });
}
function fail(label: string, detail: string) {
  checks.push({ ok: false, label, detail });
}

// ---- .env exists ----------------------------------------------------------

if (!fs.existsSync(ENV_PATH)) {
  fail(
    ".env file",
    `Not found at ${ENV_PATH}\n` +
      "     This is the cause of MissingSecret and every 'DATABASE_URL not found' error.\n" +
      "     Fix: copy .env.example to .env, then fill in the values below.\n" +
      "       Windows:  copy .env.example .env\n" +
      "       macOS:    cp .env.example .env",
  );
  report();
  process.exit(1);
}
pass(".env file");

// ---- parse ----------------------------------------------------------------

const env: Record<string, string> = {};
for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
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
  env[key] = value;
}

// ---- AUTH_SECRET ----------------------------------------------------------

const secret = env.AUTH_SECRET ?? "";
if (!secret) {
  fail("AUTH_SECRET", "Empty. Sign-in will fail with MissingSecret.");
} else if (secret === "replace-me") {
  fail("AUTH_SECRET", 'Still the placeholder "replace-me".');
} else if (secret.length < 32) {
  fail("AUTH_SECRET", `Only ${secret.length} characters — at least 32 are required.`);
} else {
  pass("AUTH_SECRET");
}

if (!secret || secret === "replace-me" || secret.length < 32) {
  console.log("\n  Generate one with:");
  console.log(`    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);
}

// ---- database -------------------------------------------------------------

for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
  const value = env[key] ?? "";
  if (!value) {
    fail(
      key,
      `Empty. Prisma cannot connect.\n     Expected something like:\n` +
        `       ${key}="postgresql://postgres:YOUR_PASSWORD@localhost:5432/vantage?schema=public"`,
    );
  } else if (!value.startsWith("postgresql://") && !value.startsWith("postgres://")) {
    fail(key, `Does not look like a Postgres URL: ${value.slice(0, 40)}…`);
  } else if (value.includes("YOUR_PASSWORD") || value.includes("APNAR_PASSWORD")) {
    fail(key, "Still contains a placeholder password.");
  } else {
    pass(key);
  }
}

// ---- seed credentials -----------------------------------------------------

if (!env.SEED_ADMIN_EMAIL) {
  fail("SEED_ADMIN_EMAIL", 'Empty. Add: SEED_ADMIN_EMAIL="admin@example.com"');
} else {
  pass(`SEED_ADMIN_EMAIL (${env.SEED_ADMIN_EMAIL})`);
}

if (!env.SEED_ADMIN_PASSWORD) {
  fail(
    "SEED_ADMIN_PASSWORD",
    "Empty. The seed will invent a random password and print it once.\n" +
      '     Set one so you always know it, e.g. SEED_ADMIN_PASSWORD="Admin@2026"',
  );
} else {
  pass(`SEED_ADMIN_PASSWORD (${env.SEED_ADMIN_PASSWORD})`);
}

// ---- dependencies ---------------------------------------------------------

if (!fs.existsSync(path.join(ROOT, "node_modules"))) {
  fail("node_modules", "Not installed. Run: npm install");
} else {
  pass("node_modules");
}

if (!fs.existsSync(path.join(ROOT, "node_modules", ".prisma", "client"))) {
  fail("Prisma client", "Not generated. Run: npx prisma generate");
} else {
  pass("Prisma client");
}

report();
process.exit(checks.some((check) => !check.ok) ? 1 : 0);

function report() {
  console.log("\n  Vantage Archive — setup check\n");
  for (const check of checks) {
    console.log(`  ${check.ok ? "OK  " : "FAIL"}  ${check.label}`);
    if (check.detail) console.log(`        ${check.detail}`);
  }

  const failures = checks.filter((check) => !check.ok).length;
  console.log(
    failures === 0
      ? "\n  Everything checks out. Next: npx prisma db push && npm run db:seed && npm run dev\n"
      : `\n  ${failures} problem${failures === 1 ? "" : "s"} above. Fix those first — the app cannot start without them.\n`,
  );
}
