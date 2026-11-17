# Cinephile

A movie and TV discovery app built with Vue 3, TypeScript, and the TMDB API. Browse trending titles, search films and shows, read cast and crew details, and find where to watch each title legally in your region.

Cinephile is a metadata and discovery front end. It does not host, stream, or download video.

## Features

- Trending and popular movies and TV shows, with genre filtering
- Search across movies and shows with a keyboard-friendly command bar
- Detail pages with cast, crew, recommendations, runtime, and scores
- "Where to watch" availability per region, powered by TMDB and JustWatch
- Responsive cinematic UI with light and dark themes
- Server-side TMDB proxy with caching, retries, rate limits, and request validation

## Tech stack

- **Frontend:** Vue 3, TypeScript, Vue Router, Vite
- **Styling:** Tailwind CSS 4
- **Backend:** Express on Vercel serverless functions
- **Data:** [TMDB API](https://www.themoviedb.org/documentation/api)
- **Tests:** Vitest

## Architecture

The browser never talks to TMDB directly. Every request goes through the Express proxy in `server/index.js`, which:

- keeps the TMDB credential on the server
- caches upstream responses in memory
- retries transient failures with a timeout
- validates and clamps route parameters
- applies per-IP burst, search, and daily quota limits

The Vue app is a static SPA. `vercel.json` routes `/api/*` to the serverless function and everything else to `index.html`.

```
src/
  components/    Shared UI, including WhereToWatch
  lib/           API client, types, helpers
  router/        Route definitions
  views/         Page-level components
server/
  index.js       TMDB proxy and feedback endpoint
api/
  index.js       Vercel function entry
tests/           Vitest suites
```

## Getting started

Requires Node 20 or 24 and pnpm 10.

```sh
pnpm install
```

Create `.env.local` in the project root:

```sh
TMDB_ACCESS_TOKEN=your_tmdb_v4_read_access_token
PORT=8787
TRUST_PROXY=false
```

A TMDB v3 API key also works via `TMDB_API_KEY`. Get credentials from your [TMDB account settings](https://www.themoviedb.org/settings/api).

```sh
pnpm dev
```

The web app and API run together. To run them separately, use `pnpm dev:web` and `pnpm dev:api`.

## Scripts

| Command            | Purpose                              |
| ------------------ | ------------------------------------ |
| `pnpm dev`         | Vite and the API server together     |
| `pnpm build`       | Type-check and build for production  |
| `pnpm type-check`  | Run `vue-tsc`                        |
| `pnpm test`        | Run the Vitest suites                |
| `pnpm lint`        | Lint with Oxlint and ESLint          |
| `pnpm format`      | Format `src/` with Prettier          |

## Deploying

The project is configured for Vercel.

1. Import the repository into Vercel.
2. Add `TMDB_ACCESS_TOKEN` (or `TMDB_API_KEY`) under Project Settings → Environment Variables.
3. Deploy. `vercel.json` handles the API rewrite and SPA fallback.

Optional variables: `DISCORD_FEEDBACK_WEBHOOK_URL` for the feedback form, `DEBUG_MODE=true` to disable rate limits locally, and `TRUST_PROXY=true` if you run the server behind a trusted proxy outside Vercel.

## Data attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch.

## License

MIT
