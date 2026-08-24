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

## Add recipes (admin)

Do not edit `src/data/recipes.ts` for new dishes. Use `/admin`:

1. **Types** — create Cake, Drink, etc. and add or reorder fields
2. **Categories** — Cakes, Desserts, Drinks, and any new collection
3. **Recipes** — pick a type, fill the generated form, upload photos, publish

A new field on a type appears on the next recipe form with no code change.

Local images are saved to `public/uploads`. On Vercel, set `BLOB_READ_WRITE_TOKEN` so photos go to Vercel Blob.

## Coming soon (hide the public site)

Set `SITE_PRIVATE=true` in Vercel → Production only. `/admin` stays available so you can keep adding recipes.

## Production database

Local development uses SQLite (`DATABASE_URL=file:./prisma/dev.db`). Vercel uses Neon Postgres from `DATABASE_URL`. The production build creates tables with `prisma db push`. Also set `ADMIN_PASSWORD` and `ADMIN_SECRET`.
