# Vantage Archive

A content and video archive platform: recorded talks, lectures, documentaries and
interviews, catalogued by contributor, subject and topic.

Step 1 delivers the foundation — architecture, database, authentication, design
system, component library, route structure, security, SEO and media abstraction.
The public read path works end to end; write paths (auth forms, account screens,
admin CRUD) are Step 2.

---

## Stack

| Concern        | Choice                                        |
| -------------- | --------------------------------------------- |
| Framework      | Next.js 15, App Router, React 19              |
| Language       | TypeScript, strict mode                       |
| Styling        | Tailwind CSS v4 (CSS-first tokens)            |
| Database       | PostgreSQL 15+                                |
| ORM            | Prisma 6                                      |
| Authentication | Auth.js v5, credentials provider, JWT session |
| Validation     | Zod 4, shared between forms and API routes    |
| Icons          | lucide-react                                  |

No UI kit, no state library, no ORM wrapper. Nine runtime dependencies total.

---

## Running it locally

**Prerequisites:** Node 20.11+, PostgreSQL 15+, and — for the video pipeline —
FFmpeg with ffprobe.

```bash
# Debian/Ubuntu
sudo apt install ffmpeg
# macOS
brew install ffmpeg

# Confirm the toolchain before uploading anything
npm run check:ffmpeg
```

The application runs without FFmpeg; only video processing needs it, and the
worker refuses to start rather than failing silently on the first upload.

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
#    Set DATABASE_URL, then generate a secret:
#    openssl rand -base64 32   ->  AUTH_SECRET

# 3. Create the schema
npx prisma migrate dev --name init

# 4. Add full-text search indexes (Prisma cannot express these)
psql "$DATABASE_URL" -f prisma/sql/001_search_indexes.sql

# 5. Seed a sample catalogue
npm run db:seed

# 6. Start
npm run dev            # http://localhost:3000
```

### Admin setup

The seed creates an administrator and prints a **randomly generated password
once**, to the terminal. There is no default password — a published one is a
standing invitation on any instance where somebody forgets to change it.

```
  Admin sign-in
    email:    admin@example.com
    password: dev-8Kd2mQx7Vp
```

Pin it for a repeatable local environment with `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD` in `.env`.

**The seed is a development tool.** It writes demo content and demo accounts;
never run it against a production database. For a production administrator,
register normally through `/auth/register`, then promote the account:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'you@example.com';
```

### Scripts

| Command             | Purpose                                    |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Development server                         |
| `npm run build`     | Generate the Prisma client, then build     |
| `npm run typecheck` | `tsc --noEmit`                             |
| `npm run lint`      | ESLint                                     |
| `npm run db:studio` | Prisma Studio                              |
| `npm run db:seed`   | Reseed the sample catalogue                |
| `npm run worker`    | Video processing worker (long-running)     |
| `npm run worker:once` | Process one queued job and exit          |
| `npm run cleanup`   | Remove orphaned scratch directories        |
| `npm run check:ffmpeg` | Verify the media toolchain              |

### Running the video pipeline locally

Two processes: the site, and the worker that does the transcoding.

```bash
npm run dev      # terminal 1
npm run worker   # terminal 2
```

Uploads are accepted at `/admin/content` by an ADMIN or MODERATOR. The request
stores the file and enqueues a job, then returns immediately — FFmpeg never
runs inside an HTTP request. Watch progress at `/admin/jobs`.

---

## Environment variables

| Variable                | Required   | Notes                                        |
| ----------------------- | ---------- | -------------------------------------------- |
| `DATABASE_URL`          | yes        | Postgres connection string                    |
| `DIRECT_URL`            | no         | Non-pooled URL for Prisma Migrate             |
| `AUTH_SECRET`           | yes        | 32+ characters; signs session tokens          |
| `AUTH_URL`              | production | Canonical origin                              |
| `SESSION_MAX_AGE_DAYS`  | no         | Session lifetime, default 30                  |
| `NEXT_PUBLIC_SITE_URL`  | yes        | Used for canonicals, Open Graph, sitemap      |
| `NEXT_PUBLIC_SITE_NAME` | no         | Display name                                  |
| `NEXT_PUBLIC_MEDIA_HOSTS` | no       | Comma-separated hosts allowed by `next/image` |
| `MEDIA_PROVIDER`        | no         | `local` (default) or `s3`                     |
| `MEDIA_LOCAL_ROOT`      | no         | Upload directory for the local provider       |
| `MEDIA_PUBLIC_BASE_URL` | no         | Public prefix for locally stored files        |
| `STORAGE_ENDPOINT`      | if `s3`    | S3-compatible endpoint (R2, MinIO, B2)        |
| `STORAGE_BUCKET`        | if `s3`    | Bucket name                                   |
| `STORAGE_ACCESS_KEY`    | if `s3`    | Read server-side only; never sent to a client |
| `STORAGE_SECRET_KEY`    | if `s3`    | Read server-side only; never sent to a client |
| `STORAGE_PUBLIC_URL`    | no         | CDN origin for processed media                |
| `MAX_VIDEO_UPLOAD_MB`   | no         | Upload ceiling, default 2048                  |
| `VIDEO_WORK_DIR`        | no         | FFmpeg scratch space                          |
| `FFMPEG_PATH` / `FFPROBE_PATH` | no  | Override if not on PATH                       |
| `RATE_LIMIT_STORE`      | no         | `memory` (default) or `redis`                 |

`src/lib/env.ts` validates all of these at boot, so a misconfigured deploy fails
immediately rather than at the first request. Secrets are read only on the
server; nothing outside `NEXT_PUBLIC_*` can reach the client bundle.

---

## Directory layout

```
prisma/
  schema.prisma              Full relational model
  sql/001_search_indexes.sql tsvector + trigram indexes
  seed.ts                    Sample catalogue

src/
  app/
    (site)/                  Public pages — header/footer chrome
    (auth)/                  Sign in, register, password reset — bare chrome
    (account)/               Signed-in area — guarded in the layout
    admin/                   Staff area — role-guarded, noindex
    api/                     Route handlers
    globals.css              Design tokens
    layout.tsx  sitemap.ts  robots.ts  error.tsx  not-found.tsx

  components/
    ui/                      Primitives: button, input, badge, modal, …
    layout/                  Header, nav, search, footer, container
    content/                 Cards, grid, listing, filters, player

  config/                    Routes, navigation, site, pagination, sorting
  lib/
    auth/                    Auth.js config, guards, password, tokens
    media/                   Storage provider interface + local/S3 backends
    security/                Headers, rate limiting, sanitisation
    seo/                     Metadata builder, JSON-LD
    api/                     Typed responses and error mapping
    utils/                   Formatting, slugs, hashing
    db.ts  env.ts

  server/
    services/                All database access lives here
    mappers/                 Prisma rows -> view models

  types/  validation/  hooks/
```

The rule that keeps this stable: **pages compose, services query, mappers
translate.** A page never touches Prisma, and a component never receives a
Prisma row.

---

## Design system

Dark, content-first, and deliberately quiet so thumbnails carry the colour. The
neutral ramp is cooled slightly; one warm accent (brass `#D9A441`, borrowed from
film leader and library card stock) is the only saturated value in the interface.

Three typefaces, three jobs: Space Grotesk for display, Inter for reading, and
JetBrains Mono for metadata. Metadata set as mono "slates" — timecodes, view
counts, eyebrow labels — is the signature device, and it repeats from card
corners to section headers to breadcrumbs.

Every value is a token in `globals.css` under `@theme`. Components reference
tokens (`bg-surface`, `text-ink-muted`, `rounded-card`), never raw hex.

Accessibility floor, met throughout: semantic landmarks, one visible focus
treatment, labelled controls, `aria-current` on active navigation, a skip link,
`<dialog>`-based modals for real focus trapping, and `prefers-reduced-motion`
respected globally.

---

## Database

Sixteen models. Highlights:

- **Content** carries a `MediaKind` enum, so audio, image and document records
  need no schema change — only a new player branch.
- **MediaAsset** separates storage from content. `provider + objectKey`
  identifies an object; URLs are resolved at read time. Moving from disk to S3
  to R2 is a config change.
- **Counters** (`viewCount`, `favoriteCount`, `contentCount`, `totalViews`) are
  denormalised so listing queries stay index-only, and reconciled by
  `recountTaxonomy()`.
- **Views** are append-only and de-duplicated per viewer over 30 minutes.
  Anonymous views use a hashed session key; no raw IP is ever stored.
- **Indexes** are composite and ordered to match real queries:
  `(status, publishedAt DESC)`, `(status, viewCount DESC)`,
  `(creatorId, status, publishedAt DESC)`, and so on.
- **Search** uses a generated `tsvector` column weighted title > summary >
  description, with a GIN index, plus trigram indexes for typeahead.

---

## Security

- bcrypt at cost 12; comparison always runs, even for a missing user, so
  response timing does not reveal which addresses are registered.
- Password reset tokens stored as SHA-256 hashes with a 30-minute single use.
- Route protection in three places: middleware, the route-group layout, and the
  service call — a routing mistake alone cannot expose private data.
- CSP, HSTS, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` on
  every response.
- Named rate limits per action; store swappable for Redis.
- All queries parameterised, including the raw SQL used for search.
- Post-login redirects restricted to same-origin relative paths.

---

## What Step 2 builds

1. Auth forms — sign in, register, forgot and reset password, with server
   actions and inline validation.
2. Account screens — overview, saved, history with resume points, settings and
   password change.
3. Admin CRUD — content editor with slug generation and publishing workflow,
   plus contributors, subjects, topics, users, reports and settings.
4. Media upload — presigned S3 uploads, image derivatives, and the media
   library UI.
5. Engagement — save buttons, progress persistence, and the report dialog.
6. Trending — scored ranking over the rolling view window.
7. Transactional email for password reset.
8. Tests and CI.

---

## Notes on the reference material

The brief cited a reference site for UX inspiration. That site is an adult
platform, so it was not used. The information architecture here follows the
conventions common to every mainstream video and media library — card grid,
taxonomy browsing, contributor pages, search with sort and filters, a detail
page with related items. No third-party code, assets or branding are included;
everything in this repository is original.


---

## Video pipeline

```
Admin upload  ->  validation  ->  source storage  ->  processing_jobs row
                                                            |
                                    worker process (npm run worker)
                                                            |
        ffprobe metadata -> WebP thumbnail -> HLS ladder -> object storage
                                                            |
                                   status = READY  ->  CDN  ->  player
```

**Never upscales.** A 1080p source yields 1080p/720p/480p; a 480p source yields
480p only. Manufacturing a "1080p" variant from a 480p master would cost
bandwidth and encoding time to deliver a blurrier picture than the original,
and would advertise a quality the archive does not hold. Sources below the
smallest rung are encoded at their own height so they are still streamable.

**Ready means ready.** The database is marked READY only after every segment,
playlist, thumbnail and the master have actually been written. The master
playlist is uploaded last, so a partially uploaded ladder is unreachable rather
than half-playable.

**Queue.** Jobs live in `processing_jobs` and are claimed with
`FOR UPDATE SKIP LOCKED`, so several workers can share one queue safely. Retries
back off (1min, 5min, 15min) and stop at `maxAttempts` — a corrupt upload is not
retried at all, since re-encoding it three times only wastes CPU. Jobs whose
worker died are requeued after 90 minutes.

**Redis is not required.** A Postgres-backed queue avoids a second piece of
infrastructure for a workload measured in jobs per hour. If throughput ever
justifies it, replacing the four functions in `src/server/video/queue.ts` with a
BullMQ implementation is the only change needed.

### Storage layout

```
videos/original/{id}/source.ext      private — never served publicly
videos/hls/{id}/master.m3u8          public via CDN
videos/hls/{id}/{label}/playlist.m3u8
videos/hls/{id}/{label}/segment-0000.ts
videos/thumbnails/{id}/thumbnail.webp
videos/previews/{id}/preview.webp
```

Keys are built from ids the application generates, never from an uploaded
filename — that removes path traversal as a category of bug rather than trying
to sanitise it away. `original/` sits under its own prefix so a bucket policy
can keep sources private while derived assets are public.

### Upload validation

Three independent checks, because any one of them can be fooled:

1. Extension — a hint only, with executables and scripts rejected outright.
2. Magic bytes — the actual container signature at the head of the file.
3. ffprobe — in the worker, confirming a decodable video stream exists.

A shell script named `clip.mp4` fails all three.

### Deletion

`deleteVideoAssets(id, "soft")` is the default: the recording stops being
reachable but the bytes remain, because a takedown may be appealed or subject to
a legal hold. `"purge"` is irreversible and should only follow an explicit
retention decision.


---

## Media and storage

One provider interface, three backends. Nothing outside `lib/media` and
`server/services/media-service` knows which one is configured — components
receive resolved URLs and never touch a storage vendor.

```
MediaStorageProvider
  upload()  delete()  resolveUrl()  exists()  getMetadata()
  createUploadAuthorization()   // optional: null when unsupported
```

| Backend | upload | signed read | direct upload |
| ------- | ------ | ----------- | ------------- |
| Local disk (default) | yes | n/a — public path | **no** (falls back to proxy) |
| S3 / R2 / MinIO / B2 | yes | yes | yes |

### Upload flow

```
browser -> POST /api/admin/media/authorize   (server validates, signs a key)
        -> PUT  directly to storage          (bytes never touch Next.js)
        -> POST /api/admin/media/confirm     (server verifies the object exists)
```

`confirm` reads the object's **real size from storage** before writing a row, so
a client that requested authorization and never uploaded cannot register a
phantom asset, and a client-claimed size is never trusted.

When the backend cannot sign uploads — local disk in development — `authorize`
returns `mode: "proxy"` and the file is posted through
`/api/admin/media/upload` instead. The UI says which path it used. It does not
pretend a direct upload happened.

### Validation

Three independent checks, because any one can be fooled:

1. **Extension** — a hint only; executables, scripts and SVG are rejected outright.
2. **Magic bytes** — the real container signature (JPEG `FF D8 FF`, PNG
   signature, RIFF/WEBP, `ftyp` + AVIF brand).
3. **Declared vs detected** — a PNG uploaded as `image/jpeg` is refused rather
   than silently corrected.

SVG is deliberately excluded: it is an executable document that can carry
script, and serving one from our own origin would be a stored-XSS vector.

### Storage keys

```
content/{contentId}/thumbnail/{token}.webp
content/{contentId}/video/{token}.mp4        private
creator/{creatorId}/avatar/{token}.jpg
site/{slot}/{token}.png
```

Keys are built from ids the application generates plus a random token. The
uploaded filename is kept **only for display** and never contributes to a key,
which removes path traversal as a category of bug rather than sanitising for it.
Originals sit under their own prefix so a bucket policy can keep them private
while derived assets are public.

### Deletion

`deleteAsset()` refuses while anything still references an asset and reports how
many references remain — a shared image is never destroyed because one of its
users was removed. Storage is cleared first and the row dropped only after that
succeeds, so a storage failure cannot orphan bytes silently.

### Orphan review

`/admin/media/orphans` reports assets nothing references, and rows whose file is
missing from storage. **Nothing is swept automatically:** an asset can look
orphaned simply because a draft referencing it has not been saved yet, and an
automatic cleanup would quietly destroy real work.


---

## Email

Provider-neutral. `EMAIL_PROVIDER` selects the transport; nothing outside
`lib/email` knows which is active.

| Value | Behaviour |
| ----- | --------- |
| `console` (default) | Writes the message to the server log. **Delivers nothing** and reports `skipped`, so no caller can claim an email was sent. |
| `resend` | Resend HTTPS API. Needs `RESEND_API_KEY` + `EMAIL_FROM`. |
| `postmark` | Postmark HTTPS API. Needs `POSTMARK_SERVER_TOKEN` + `EMAIL_FROM`. |
| `smtp` | Declared, **not implemented** — fails loudly. Needs a socket client such as nodemailer. |

No provider SDK is a dependency: both HTTP providers are a single `fetch`.

Password reset and email-change verification are wired to it. Reset keeps its
generic response whether or not delivery succeeds — a different reply on
failure would still reveal which addresses exist.

---

## Deployment

The project is prepared for deployment but **not deployed**, and nothing here
provisions infrastructure.

### Requirements

| Component | Notes |
| --------- | ----- |
| Node | 20.11+ |
| PostgreSQL | 15+, `sslmode=require` in production |
| FFmpeg | Only for the video worker; the site runs without it |
| Object storage | S3-compatible. Optional — local disk works, but does not scale |

### Steps

```bash
npm ci
npx prisma migrate deploy          # never `migrate dev` in production
psql "$DATABASE_URL" -f prisma/sql/001_search_indexes.sql
npm run build
npm start                          # web
npm run worker                     # video processing, separate process
```

Set `NODE_ENV=production` so secure cookies and terse error output are active.
Terminate TLS in front of the app; HSTS is already sent.

### Two processes, not one

The site and the video worker run separately on purpose: a transcode can take
an hour and must not occupy a request handler or be killed by a serverless
timeout. A platform that only runs the web process will accept uploads and
never process them.

### Before going live

- Generate a fresh `AUTH_SECRET`; never reuse one across environments.
- Point `NEXT_PUBLIC_SITE_URL` and `AUTH_URL` at the canonical origin — these
  pin the Server Action CSRF origin check.
- Keep `videos/original/` and `content/*/video/` private in the bucket.
- Serve processed media from `STORAGE_PUBLIC_URL` (a CDN), not through Next.
- Swap the in-process rate limiter for Redis before running more than one
  instance — see `SECURITY.md`.

Security posture, production configuration and backup recommendations are
documented in [`SECURITY.md`](./SECURITY.md).

## Windows local video processing

Keep `ffmpeg.exe` and `ffprobe.exe` in `tools/`. The development worker auto-detects these bundled binaries, so a global FFmpeg installation is not required. `npm run dev` starts Next.js and the video worker together.

If the browser ever shows the site as unstyled after changing the project, run `npm run dev:reset` once to clear the Next.js development cache, then reload `http://localhost:3000`.
