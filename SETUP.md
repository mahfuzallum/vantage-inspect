# Setup — start here

Follow these in order. Do not skip any.

**Extract this zip to a fresh, empty folder.** Do not unzip it over an older
copy of the project. Mixing files from different versions is what produced the
`Module not found: ./settings-forms` error — half the files came from one
version and half from another.

---

## 1. Install

Open a terminal in the folder that contains `package.json`.

```
npm install
```

## 2. Create the `.env` file

```
copy .env.example .env
```

(macOS/Linux: `cp .env.example .env`)

## 3. Generate a secret

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the long line it prints.

## 4. Fill in `.env`

```
notepad .env
```

Set these five lines. Everything else can stay as it is.

```
AUTH_SECRET="<paste the line from step 3 here>"
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/vantage?schema=public"
DIRECT_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/vantage?schema=public"
SEED_ADMIN_EMAIL="admin@example.com"
SEED_ADMIN_PASSWORD="Admin@2026"
```

`YOUR_POSTGRES_PASSWORD` is the password you set when installing PostgreSQL.
`DATABASE_URL` and `DIRECT_URL` are the same value.

Save the file.

## 5. Check it

```
npm run doctor
```

This reads `.env` and tells you exactly which line is wrong, if any. Every
line must say `OK` before you continue. `MissingSecret` and
`Environment variable not found: DATABASE_URL` both mean step 4 is incomplete.

## 6. Create the database

Only needed once. If it already exists you will see
`database "vantage" already exists`, which is fine.

```
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE vantage;"
```

Adjust `18` to your installed version.

## 7. Set up the tables

```
npx prisma generate
npx prisma db push
```

## 8. Load the starting data

```
npm run db:seed
```

## 9. Start it

```
npm run dev
```

Open http://localhost:3000

**Sign in:** `admin@example.com` / `Admin@2026`
(or whatever you set in step 4)

Admin panel: http://localhost:3000/admin

### The quick way in

Tap the **WebcamPrime** wordmark in the header **five times within two
seconds**. A code box appears; the default code is `WcpAdmin2026`, set by
`ADMIN_UNLOCK_CODE` in `.env`.

Change it from **Admin → Settings → Unlock code**. Once changed, the value in
`.env` is ignored — the code lives in the database, hashed, and the plaintext
is never stored anywhere.

Email and password still work as a fallback if you forget the code.

---

## Video processing

Uploaded video needs FFmpeg and a worker running in a **second terminal**,
alongside `npm run dev`:

```
npm run worker
```

Check FFmpeg is available first:

```
ffmpeg -version
```

If that fails, the worker will accept uploads but every transcode will end as
FAILED.

---

## Search

Search works out of the box using a substring match across titles, summaries,
contributors and categories.

For proper full-text search — stemming, phrase queries, relevance ranking — run
this once. The application detects the column and switches to it automatically.

```
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d vantage -f prisma\sql\001_search_indexes.sql
```

---

## If the admin password stops working

The seed does not overwrite an existing admin, so changing
`SEED_ADMIN_PASSWORD` alone has no effect. Delete the user and re-seed:

```
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d vantage -c "DELETE FROM users;"
npm run db:seed
```

---

## Why the home page says "sample data"

Uploads are saved as **drafts**. The public site only shows published records,
so a catalogue containing only drafts reads as empty and the demo content is
shown instead.

Publish from **Admin → Content** — the `Draft` button in each row toggles it
to `Live`. The message disappears once one record is published.
