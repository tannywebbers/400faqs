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

## Wiring
- Web → API uses `NEXT_PUBLIC_API_URL` = `https://4000-${BASE44_PUBLIC_HOST_SUFFIX}`
  (public, separate origin). Both client-side and Next SSR (`serverFetch`/`publicFetch`)
  use it. API CORS accepts any origin when `CORS_ORIGINS` is empty.
- `next.config.mjs` adds `allowedDevOrigins` from `BASE44_PUBLIC_HOST_SUFFIX` so the
  preview origin's dev assets/HMR aren't blocked.

## Local-only credentials (in compose, not secrets)
Postgres/Redis user+pass (`400faqs`), `JWT_SECRET`, admin bootstrap
(`admin@400faqs.com` / `admin1234`). All generated for local dev.

## External secrets (optional — app boots without them)
`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`,
`GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`. None are required at boot; the API starts in
degraded mode (no WhatsApp/AI features) when absent. Provide via the Base44 secrets
UI; they land in `/run/base44/app.env` (already wired as the api's last `env_file`).

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
