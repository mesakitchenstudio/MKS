# Mesa Kitchen Studio

Recipe brand site for [mesakitchenstudio.com](https://mesakitchenstudio.com) — studio-tested recipes for gathering around the table.

## Local development

Requires Node.js 20+. This machine can use the portable install at `%LOCALAPPDATA%\nodejs-portable\node-v22.18.0-win-x64`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Add a recipe

1. Open `src/data/recipes.ts`.
2. Copy an existing recipe object and change the `slug`, copy, times, and ingredients.
3. Put the slug in the right `categories` so it appears on homepage collections and `/category/[slug]`.

## Deploy

The app is ready for Vercel. After deploy, attach `mesakitchenstudio.com` and update DNS at your registrar.
