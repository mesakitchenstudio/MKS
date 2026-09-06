# Mesa Kitchen Studio

Recipe brand site for [mesakitchenstudio.com](https://mesakitchenstudio.com) — studio-tested recipes for gathering around the table.

## Local development

Requires Node.js 20+. This machine can use the portable install at `%LOCALAPPDATA%\nodejs-portable\node-v22.18.0-win-x64`.

```bash
npm install
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Admin: [http://localhost:3000/admin](http://localhost:3000/admin). Set `ADMIN_PASSWORD` and `ADMIN_SECRET` in `.env` — never commit those values.

### Google member sign-in (OAuth + One Tap)

Public members use Auth.js with the same Google Web client for redirect sign-in and One Tap / FedCM.

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTH_GOOGLE_ID` | Yes (for Google) | Google Cloud Web OAuth client ID (audience for ID tokens + One Tap) |
| `AUTH_GOOGLE_SECRET` | Yes (for redirect OAuth) | Google OAuth client secret (server only) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional | Same client ID as `AUTH_GOOGLE_ID`; layout already passes `AUTH_GOOGLE_ID` to the One Tap client |
| `AUTH_SECRET` | Yes | Auth.js session signing secret |

Authorized JavaScript origins in Google Cloud must include the live host after redirect: `https://www.mesakitchenstudio.com` (apex `https://mesakitchenstudio.com` 308s to www). Redirect URI: `https://www.mesakitchenstudio.com/api/auth/callback/google`. One Tap stays off while `SITE_PRIVATE=true`.

### AI recipe assistant (Admin)

Editors/Owners can paste a YouTube cooking URL on **New Recipe** to draft fields via Gemini. Drafts are never auto-published.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes (for AI) | Google AI Studio / Gemini API key |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.7-flash` |

Never expose these keys to the browser. Generation runs only on `POST /api/admin/recipes/ai-generate` for content roles.

## Add recipes (admin)

Do not edit `src/data/recipes.ts` for new dishes. Use `/admin`:

1. **Types** — create Cake, Drink, etc. and add or reorder fields
2. **Categories** — Cakes, Desserts, Drinks, and any new collection
3. **Recipes** — pick a type, fill the generated form, upload photos, publish

A new field on a type appears on the next recipe form with no code change.

Local images are saved to `public/uploads`. On Vercel, set `BLOB_READ_WRITE_TOKEN` so photos go to Vercel Blob.

### Transactional email (password reset, contact, newsletter)

Admin and member password-reset emails, contact-form delivery, and newsletter welcome / studio signup notices use [Resend](https://resend.com). Set these in Vercel (Production + Preview):

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Yes | Resend API key (`re_…`) |
| `EMAIL_FROM` | Recommended | Verified sender on your domain, e.g. `Mesa Kitchen Studio <hello@mesakitchenstudio.com>` |
| `CONTACT_TO_EMAIL` | Optional | Studio inbox for contact + newsletter signup notices (falls back to `ADMIN_EMAIL`) |

`EMAIL_FROM` must use a domain verified in Resend. Without `RESEND_API_KEY`, forgot-password still shows the same generic success message (no account enumeration), newsletter signup still persists subscribers, and welcome mail is skipped with a server log that mail is not configured.


Optional: set `IP2LOCATION_API_KEY` for member IP lookups (free plan at [ip2location.io](https://www.ip2location.io) — 50k lookups/month). Without a key, IP2Location allows 1,000 lookups/day.

## Coming soon (hide the public site)

Set `SITE_PRIVATE=true` in Vercel → Production only while you prep recipes. `/admin` stays available.

**Important for Google:** while this flag is on, `robots.txt` blocks all crawlers and visitors see “Coming soon.” To appear in search for “Mesa Kitchen Studio”, remove `SITE_PRIVATE` from Production (or set it to `false`) and redeploy. Then verify the domain in [Google Search Console](https://search.google.com/search-console) and submit `https://mesakitchenstudio.com/sitemap.xml`.

Optional: set `GOOGLE_SITE_VERIFICATION` in Vercel to the HTML-tag verification code from Search Console.

## Production database

Local development uses SQLite (`DATABASE_URL=file:./prisma/dev.db`). Vercel uses Neon Postgres from `DATABASE_URL`. The production build creates tables with `prisma db push`. Also set `ADMIN_PASSWORD` and `ADMIN_SECRET`.
