# Architecture

## Layering rule

```
Page / Route handler   composes UI, parses params, sets metadata
        │
        ▼
Service (src/server)   the only place that talks to Prisma
        │
        ▼
Mapper                 Prisma row -> view model
        │
        ▼
Component              receives view models, never DB rows
```

A page never imports `db`. A component never imports Prisma types except the
enums it renders. This is what keeps schema changes from rippling into the UI.

## Route map

| Route                     | Type      | Status  | Notes                              |
| ------------------------- | --------- | ------- | ---------------------------------- |
| `/`                       | ISR 300s  | Built   | Featured, latest, subjects, popular |
| `/latest`                 | Dynamic   | Built   | Shared listing surface              |
| `/popular`                | Dynamic   | Built   | Shared listing surface              |
| `/featured`               | Dynamic   | Built   | Shared listing surface              |
| `/search`                 | Dynamic   | Built   | Full-text, noindex                  |
| `/categories`             | ISR 600s  | Built   | Subject index                       |
| `/category/[slug]`        | Dynamic   | Built   | Per-subject listing                 |
| `/tags`                   | ISR 600s  | Built   | Topic index                         |
| `/tag/[slug]`             | Dynamic   | Built   | Per-topic listing                   |
| `/creators`               | Dynamic   | Built   | Contributor index                   |
| `/creator/[slug]`         | Dynamic   | Built   | Profile + their recordings          |
| `/content/[slug]`         | Dynamic   | Built   | Player, metadata, tags, related     |
| `/auth/login`             | Static    | Step 2  | Provider + rate limit ready         |
| `/auth/register`          | Static    | Step 2  | API route already live              |
| `/auth/forgot-password`   | Static    | Step 2  | Token issuing ready                 |
| `/auth/reset-password`    | Static    | Step 2  | Token consumption ready             |
| `/account`                | Guarded   | Step 2  | Layout + guard live                 |
| `/account/favorites`      | Guarded   | Step 2  | Service live                        |
| `/account/history`        | Guarded   | Step 2  | Service live                        |
| `/account/settings`       | Guarded   | Step 2  | Schemas live                        |
| `/admin` + 9 sections     | Role-gated| Step 2  | Shell, nav, guards live             |

### API

| Endpoint                  | Method | Purpose                        |
| ------------------------- | ------ | ------------------------------ |
| `/api/auth/[...nextauth]` | GET/POST | Auth.js endpoints            |
| `/api/auth/register`      | POST   | Account creation               |
| `/api/content`            | GET    | Listing / load-more            |
| `/api/search/suggestions` | GET    | Typeahead                      |
| `/api/health`             | GET    | Liveness + DB reachability     |

## Entities

`User`, `Account`, `Session`, `PasswordResetToken`, `UserPreference`,
`MediaAsset`, `Creator`, `Category`, `Tag`, `Content`, `ContentTag`,
`Favorite`, `View`, `ViewingHistory`, `Report`, `SiteSetting`, `AuditLog`.

### Key relationships

- `Content` → `Creator` (optional, `SetNull`), `Category` (optional, `SetNull`)
- `Content` ↔ `Tag` through `ContentTag` (composite PK, cascade both sides)
- `Content` → `MediaAsset` twice: `thumbnail` and `source` (named relations)
- `Favorite`, `View`, `ViewingHistory` cascade from both `User` and `Content`
- `Report` keeps `authorId`/`handlerId` as `SetNull` so deleting a user does
  not destroy the moderation record

### Caching

| Surface       | Strategy                          | Invalidation      |
| ------------- | --------------------------------- | ----------------- |
| Home rails    | `unstable_cache`, 300s            | tag `content`     |
| Subjects/topics | `unstable_cache`, 600s          | tag `taxonomy`    |
| Site settings | `unstable_cache`, 300s            | tag `settings`    |
| `/api/content`| `s-maxage=60, SWR=300`            | time              |
| Sitemap       | `revalidate = 3600`               | time              |

## Extension points

| Need                  | Change                                                  |
| --------------------- | ------------------------------------------------------- |
| New media type        | Add to `MediaKind`, branch in `MediaPlayer`             |
| Move storage to R2    | `MEDIA_PROVIDER=s3` + finish `S3MediaProvider`          |
| Add Google sign-in    | One provider entry in `lib/auth/index.ts`               |
| Multi-instance limits | Implement `RateLimitStore` against Redis                |
| Database sessions     | Swap the strategy; the `Session` table already exists   |
| Comments              | New model + `ReportTargetType.COMMENT` already reserved |
