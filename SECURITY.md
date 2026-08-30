# Security and production hardening

Current state of the controls in this codebase, and what still has to be
configured before it faces the internet.

---

## Controls in place

| Area          | Control                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passwords     | bcrypt cost 12. Comparison always runs — including for unknown accounts, against a real decoy hash — so response time cannot be used to enumerate addresses.                                            |
| Sessions      | JWT in an `httpOnly`, `sameSite=lax` cookie, `__Secure-` prefixed and `secure` in production. "Remember this device" is enforced in the JWT callback: an unremembered token is rejected after 24 hours. |
| Reset tokens  | Stored as SHA-256 hashes only, 30-minute expiry, single use, all sessions dropped on success.                                                                                                           |
| Authorization | Three layers: middleware, route-group layout, and a guard inside every page and action. `requireStaff` for reads, `requireAdmin` for destructive and configuration operations.                          |
| IDOR          | No action accepts an identity from the client. Every user-scoped query takes the session `userId`; history and favourite deletes scope by `userId` in the same statement.                               |
| Input         | Zod schemas on every form, body and query parameter. Listing params are `.catch()`-guarded so a hand-edited URL degrades rather than throwing.                                                          |
| SQL           | Prisma query builder throughout; the three raw queries use tagged-template parameter binding. No `$queryRawUnsafe` anywhere.                                                                            |
| XSS           | No untrusted HTML is rendered. The four `dangerouslySetInnerHTML` uses are JSON-LD built server-side, with `<` escaped to `\u003c`.                                                                     |
| CSRF          | Server Actions are protected by Next's Origin/Host check, with `allowedOrigins` pinned to the configured site host.                                                                                     |
| Uploads       | Extension, magic bytes, and declared-vs-detected type must all agree. Executables, scripts and SVG rejected. Storage keys are generated from application ids, never filenames.                          |
| Media         | Credentials read server-side only; no client component imports a storage provider. Private objects use short-lived signed URLs.                                                                         |
| Redirects     | `callbackUrl` passes through `safeRedirectPath`; only same-origin relative paths survive.                                                                                                               |
| Privacy       | No IP addresses, locations or device fingerprints stored. Anonymous views use a rotating opaque cookie; audit entries store a salted IP hash only.                                                      |
| Logging       | `lib/security/logger` emits single-line JSON with a redaction backstop for credential-shaped values and forbidden field names.                                                                          |
| Headers       | CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.                                                                    |

### Rate limits

| Action                                | Limit                         |
| ------------------------------------- | ----------------------------- |
| Login                                 | 5 / 15 min                    |
| Registration                          | 5 / hour                      |
| Password reset request and completion | 3 / hour                      |
| Password change                       | 5 / 30 min                    |
| Email change                          | 3 / hour                      |
| Account deletion                      | 3 / hour                      |
| Reports                               | 10 / hour                     |
| Uploads                               | 40 / hour (60 authorizations) |
| Favourites                            | 120 / hour                    |
| View tracking                         | 300 / hour                    |
| Search                                | 60 / min                      |
| Generic API                           | 120 / min                     |

**The default store is in-process.** That is correct for a single instance and
wrong for several: each replica keeps its own counters, so effective limits
multiply by the replica count.

`RateLimitStore` now reports `id` and `distributed`, and `rateLimitBackend()`
lets an operator confirm which is live. `RedisRateLimitStore` is declared and
throws if selected without an implementation — it never silently degrades to
per-process counting.

**Redis or another distributed backend is required before horizontal scaling.**

---

## Remaining risks

1. **CSP allows `'unsafe-inline'` for scripts.** Next's runtime bootstrap needs
   it without nonce-based middleware. This weakens CSP as an XSS backstop; it is
   not the primary control (no untrusted HTML is rendered anywhere), but it
   should be tightened with a nonce middleware before a high-risk deployment.
2. **Account deletion is immediate.** No grace period and no data export.
3. **Email delivery depends on configuration.** The transport abstraction is
   complete and password reset and email-change are wired to it, but the
   default `EMAIL_PROVIDER=console` logs messages instead of sending them. Set
   `EMAIL_PROVIDER=resend|postmark` with `EMAIL_FROM` to deliver. SMTP is
   declared but unimplemented and fails loudly rather than pretending.
4. **Dependency advisories remain** — see below.

---

## Production configuration required

```bash
AUTH_SECRET=          # openssl rand -base64 32 — never reuse across environments
AUTH_URL=             # canonical https:// origin
NEXT_PUBLIC_SITE_URL= # same origin; pins Server Action allowed origins
DATABASE_URL=         # use sslmode=require
STORAGE_*             # bucket credentials, server-side only
```

- Terminate TLS in front of the app; HSTS is already sent with a two-year max-age.
- Serve processed media from `STORAGE_PUBLIC_URL` (a CDN), not through Next.
- Keep the storage bucket private for `videos/original/` and `content/*/video/`.
- Run `prisma migrate deploy` — never `migrate dev` — against production.
- Set `NODE_ENV=production` so secure cookies and terse errors are active.

---

## Backups

**None of this is configured by the repository.** The commands below are a
recommended starting point, not something already running.

### PostgreSQL

```bash
# Nightly full dump, custom format so it can be restored selectively
pg_dump --format=custom --no-owner "$DATABASE_URL" \
  > "vantage-$(date -u +%Y%m%dT%H%M).dump"
```

Suggested: nightly full backups with 30-day retention, plus continuous WAL
archiving (or a managed provider's point-in-time recovery) if the recovery point
objective is under 24 hours. **Restore-test quarterly** — an untested backup is
a hypothesis, not a backup.

### Media storage

Originals under `videos/original/` and `content/*/video/` are the only
irreplaceable objects; HLS renditions and thumbnails can be regenerated from
them by re-running the processing job. Enable bucket versioning and
cross-region replication for the original prefixes; derived prefixes can use a
shorter retention.

### Configuration

Secrets belong in a managed secret store, not in the repository or the backup
set. Record which secret versions were live alongside each database backup, so
a restore can be paired with credentials that decrypt the same sessions.

---

## Dependency audit

Run `npm audit --omit=dev` for the current position. As of this step: 5
advisories remain, all transitive through `next` and `prisma`, and all reachable
only at build time or on the server (`postcss`, `sharp`, `@prisma/config`,
`deepmerge-ts`). None ship to the browser.

They are fixable only by major-version upgrades (`next@16`, `prisma@7`), which
were **not** applied here — a major framework bump is not a security fix to
make blind at the end of a hardening pass. Schedule it as its own change with a
full regression run.
