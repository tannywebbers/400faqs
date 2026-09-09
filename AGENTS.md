# 400faqs — Base44 Dev Notes

## What this is
npm workspace monorepo: a WhatsApp-powered multiplayer questions game.
- `apps/web` — Next.js 14 (App Router) public site + admin console. User-facing entry on port 3000.
- `apps/api` — Express REST API + BullMQ workers, port 4000. Runs via `tsx watch`.
- `packages/db` — Prisma schema, migrations, seed, shared client.

## Running here
`docker compose -f docker-compose.base44.yml up -d` brings up:
- `postgres` (16) + `redis` (7) with healthchecks
- `setup` (one-shot): `npm install`, `prisma generate`, builds `@400faqs/db` (its `main` → `dist/`)
- `migrate` (one-shot): `prisma db push --accept-data-loss` + `db:seed` (the committed
  migration is stale — table names drifted from PascalCase to snake_case via `@@map`;
  `db push` syncs the live schema.prisma to the DB instead of the stale migration)
- `api` (depends on migrate + redis) and `web` (depends on api)

A shared `node_modules` named volume is populated by `setup` and reused by every
node service — deps are installed once. Source is bind-mounted, so edits hot-reload:
`tsx watch` (api) and `next dev` (web, with `WATCHPACK_POLLING`/`CHOKIDAR_USEPOLLING`
for bind-mount reliability).

## Architecture (in transition)
The app is migrating from Express API + Prisma + Redis to Supabase-direct frontend
access with Edge Functions for workers.

**Public pages** now talk directly to Supabase via `@supabase/supabase-js`:
- `apps/web/src/lib/supabase.ts` — `serverSupabase()` (service_role, RSC only) and
  `browserSupabase()` (anon key, client components).
- `apps/web/src/lib/queries/public-server.ts` — server-side queries for RSC pages.
- `apps/web/src/lib/queries/public-client.ts` — client-side queries for interactive pages.
- Table names are PascalCase (`Category`, `Question`, `Faq`, `Setting`, etc.) except
  `landing_content` (snake_case, via Prisma `@@map`). The `landing_content` table also
  uses snake_case column names (`section_key`, `is_visible`, `sort_order`, etc.).

**Admin pages** still use the Express API (`apiFetch` from `@/lib/api`). Migration to
Supabase direct + Supabase Auth is pending.

**Workers** are now a Supabase Edge Function (`supabase/functions/housekeeping/index.ts`),
triggered by external cron or pg_cron (`supabase/cron-housekeeping.sql`).

## Wiring
- Web → Supabase uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (browser) and `SUPABASE_SECRET_KEY` (server). All delivered via `/run/base44/app.env`.
- Web → API (admin only) uses `NEXT_PUBLIC_API_URL` = `https://4000-${BASE44_PUBLIC_HOST_SUFFIX}`.
  API CORS accepts any origin when `CORS_ORIGINS` is empty.
- `next.config.mjs` adds `allowedDevOrigins` from `BASE44_PUBLIC_HOST_SUFFIX` so the
  preview origin's dev assets/HMR aren't blocked.

## Local-only credentials (in compose, not secrets)
Postgres/Redis user+pass (`400faqs`), `JWT_SECRET`, admin bootstrap
(`admin@400faqs.com` / `admin1234`). All generated for local dev.

## External secrets
**Required at boot:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SECRET_KEY` — the frontend reads public data directly from Supabase.
All three are wired into both `api` and `web` services via `env_file: /run/base44/app.env`.

**Optional:** `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`,
`GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`. The API starts in degraded mode without them.

## Verify it works
- `docker compose -f docker-compose.base44.yml ps` — api/web Up, setup/migrate Exited(0).
- `curl -sf -H "Host: external.preview.example" http://localhost:3000/` returns HTML.
- `curl -sf http://localhost:4000/health` returns JSON.
- Preview loads the landing page; admin login at `/back` with admin@400faqs.com / admin1234.

## Notes / gotchas
- `@400faqs/db` must be compiled (`dist/`) before the API can import it — `setup`
  does this. If you wipe `packages/db/dist`, re-run the setup service.
- The API sets `WORKER_PROCESS=0` in dev (API server only, no in-process workers).
  Redis is still required and wired.
- `prisma db push` (not `migrate deploy`) is used because the committed migration is
  stale (PascalCase table names vs the schema's snake_case `@@map`). `db push` keeps
  the DB in sync with `schema.prisma` directly.
