# 400faqs — Setup Guide

Everything you need to run **400faqs** locally, self-host it anywhere, and deploy it
to **Vercel**, step by step.

400faqs is an npm **workspace monorepo** with three packages:

| Path | Package | What it is |
|------|---------|------------|
| `apps/api` | `@400faqs/api` | Express REST API + Redis/BullMQ background workers (game, notifications, recovery, monetization) |
| `apps/web` | `@400faqs/web` | Next.js 14 public website + admin console |
| `packages/db` | `@400faqs/db` | Prisma schema, migrations, seed, shared DB client / types |

The API talks to **PostgreSQL** (via Prisma) and **Redis** (via BullMQ for jobs).
The web talks to the API over HTTP and renders both the public site and the admin panel.

---

## 1. Prerequisites

- **Node.js ≥ 20** (LTS recommended)
- **npm ≥ 10** (npm workspaces)
- **Docker + Docker Compose** (easiest local Postgres + Redis) — or any reachable Postgres/Redis
- A **Postgres** database (Supabase, Neon, Railway, Render, local, etc.)
- A **Redis** instance (Redis Cloud, Upstash, local Docker, Railway, etc.) — required by BullMQ/workers
- (Production services) **Meta WhatsApp Business Cloud API** account, **Google AI (Gemini)** API key

---

## 2. Clone & install

```bash
git clone <your-repo-url> 400faqs
cd 400faqs
npm install
```

`npm install` installs all workspace dependencies and links `@400faqs/*` together.

---

## 3. Environment variables (the `.env`)

Copy the template to the **repo root** and fill in real values:

```bash
cp .env.example .env   # Windows: copy .env.example .env
```

> The app intentionally reads **one root `.env`**. All scripts (Prisma, API, seed)
> are wired to load this root `.env`, and the API's `config.ts` loads `../../.env`.

Minimum required to boot + migrate:

```env
# ---- Core ----
NODE_ENV=development
PORT=4000
API_URL=http://localhost:4000
WEB_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000     # Web → API base (public, baked into the web build)
NEXT_PUBLIC_WEB_URL=http://localhost:3000
NEXT_PUBLIC_SITE_NAME=400faqs

# ---- Database & cache ----
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME   # your Postgres connection string
REDIS_URL=redis://localhost:6379                          # or redis://:PASSWORD@HOST:PORT

# ---- Auth ----
JWT_SECRET=replace-with-a-long-random-string              # openssl rand -hex 32
JWT_EXPIRES_IN=7d
```

> **Special characters in `DATABASE_URL`** — URL-encode the password if it contains
> `@`, `:`, `/`, `#`, `%`, `?`, or `)` (e.g. `p@ss` → `p%40ss`; a space → `%20`).
> A common value `$` and `.` do **not** need encoding.

### Full variable reference

| Variable | Used by | Required | Notes |
|----------|---------|----------|-------|
| `NODE_ENV` | api/web | yes | `development` or `production` |
| `PORT` | api | yes | API listen port (default 4000) |
| `API_URL` / `WEB_URL` | api | prod | canonical public URLs (gate links, CORS) |
| `NEXT_PUBLIC_API_URL` | web | yes | **public**; web→API base URL |
| `NEXT_PUBLIC_WEB_URL` | web | yes | **public**; public web URL |
| `NEXT_PUBLIC_SITE_NAME` | web | yes | **public**; brand name |
| `DATABASE_URL` | db/api | yes | Postgres connection string |
| `REDIS_URL` | api worker | yes | Redis connection string |
| `JWT_SECRET` | api | yes | admin auth signing secret (keep secret) |
| `JWT_EXPIRES_IN` | api | no | default `7d` |
| `WHATSAPP_TOKEN` | api | WhatsApp | Meta Cloud API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | api | WhatsApp | phone number id |
| `WHATSAPP_VERIFY_TOKEN` | api | WhatsApp | webhook verify token |
| `WHATSAPP_GRAPH_VERSION` | api | no | default `v25.0` |
| `WHATSAPP_API_BASE` | api | no | default `https://graph.facebook.com` |
| `WHATSAPP_APP_SECRET` | api | WhatsApp | enables `X-Hub-Signature-256` webhook verification (recommended) |
| `GOOGLE_AI_API_KEY` | api | Google AI | Gemini key for duplicate detection (recommended) |
| `GOOGLE_AI_MODEL` | api | no | default `gemini-2.0-flash` |
| `GOOGLE_AI_ENDPOINT` | api | no | default Google generative-language endpoint |
| `GOOGLE_AI_TIMEOUT_MS` | api | no | default `15000` |
| `OPENAI_API_KEY` | api | optional | content-moderation enrichment (best effort) |
| `UPLOADS_DIR` | api | no | server path for uploads (default `./uploads`) |
| `UPLOADS_PUBLIC_URL` | api | no | default `/uploads` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | seed | yes | bootstrap Super Admin |
| `CORS_ORIGINS` | api | prod | comma list of allowed web origins |
| `MAINTENANCE_MODE` | api | no | `true` disables API except webhooks/status |

---

## 4. Database & cache (local)

The included `docker-compose.yml` runs **Postgres 16** and **Redis 7** locally:

```bash
docker compose up -d          # start postgres + redis
```

Local connection strings (matches the compose file):

```env
DATABASE_URL=postgresql://400faqs:400faqs@localhost:5432/400faqs
REDIS_URL=redis://localhost:6379
```

> If you already have Postgres/Redis (Supabase, Upstash, etc.), skip Docker and put
> your real connection strings in `.env`.

---

## 5. Generate the Prisma client + create/apply the schema

The project ships an initial-schema migration. From the **repo root**:

```bash
# Generate the Prisma client (also runs `prisma generate` implicitly via build)
npm run db:generate

# Apply the tracked migration(s) to your database (creates tables)
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma

# Alternative: push the schema directly (no migration history) if you prefer
npm run db:push
```

> All `db:*` scripts run from the repo root and read the root `.env`, so you never
> need to `cd` into `packages/db` to touch the database.

### Seed a Super Admin + default settings

```bash
npm run db:seed
```

The seed upserts all default `Setting` rows and creates the Super Admin from
`ADMIN_EMAIL` / `ADMIN_PASSWORD` (default `admin@400faqs.com`). **Change the
password after first login.**

---

## 6. Run locally (development)

Open two terminals (or one with the combined dev script):

```bash
# Terminal 1 — API + Redis workers (Express + BullMQ)
npm run dev:api

# Terminal 2 — Next.js web app
npm run dev:web
```

Or run both together:

```bash
npm run dev
```

- **Web app (public + admin):** http://localhost:3000
- **API:** http://localhost:4000 — health check at `/api/health` (root returns `{ name: "400faqs API", version, status: "running" }`)
- **Admin console:** http://localhost:3000/admin — sign in with the seeded admin credentials

> Background workers run inside `dev:api` when `WORKER_PROCESS!=0` (see `src/index.ts`).
> For an isolated worker process in production, see §8.

---

## 7. Verify it booted

1. `http://localhost:4000` → JSON `{ "name": "400faqs API", ... "status": "running" }`.
2. `http://localhost:3000` → the public landing page.
3. `http://localhost:3000/admin` → admin login.
4. Open the Admin **Settings** → flip `monetization.enabled` on, set WhatsApp config, etc.

---

## 8. Self-host on any server (Linux VM, VPS, Docker, Render, Railway, Fly, etc.)

### 8.1 Build

```bash
npm run build                 # builds all workspaces (db client gen + api tsc + web next build)
```

### 8.2 Run the API (+ workers) in production

The API needs two things running: the HTTP server and the background worker(s).

**Option A — single script that also runs workers:** set `WORKER_PROCESS=1` in
`.env` (or the environment) before starting, so `node dist/index.js` starts jobs.

**Option B — separate processes (recommended for horizontal scaling):**

```bash
# API web server
WORKER_PROCESS=0 node apps/api/dist/index.js

# Worker process(es)
node apps/api/dist/workers/index.js
```

### 8.3 Run the web in production

```bash
node apps/web/.next/standalone/server.js
```

> `next.config.mjs` uses `output: "standalone"`, so `apps/web/.next/standalone` is a
> self-contained server bundle — ideal for Docker/VPS. Copy `/public` and
> `/.next/static` next to the standalone server as needed.

### 8.4 Docker (any host)

You can wrap each workspace in its own image (API, worker, web), plus managed
Postgres/Redis, or point them at external Supabase/Upstash services. A minimal
API image:

```dockerfile
# Dockerfile.api
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @400faqs/api
COPY . .
RUN npm run build --workspace @400faqs/api

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app ./
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
```

### 8.5 Production run checklist

- Set `NODE_ENV=production`, a strong `JWT_SECRET`, real `DATABASE_URL` / `REDIS_URL`.
- Set `API_URL`, `WEB_URL`, `CORS_ORIGINS` (comma list of allowed origins, e.g. your web domain).
- Run the **web** with `NEXT_PUBLIC_API_URL` pointing at the deployed API URL.
- Put the **API behind HTTPS** and configure the WhatsApp webhook to its
  `/api/webhooks/whatsapp` (or the configured hook path) URL.

---

## 9. Deploy to Vercel (the web app)

Vercel hosts the **Next.js web app**. Because the web is a client of the API, the
API + Postgres + Redis must be running first (any host — see §8).

### 9.1 Create the web Vercel project

1. Push the repo to GitHub (or GitLab/Bitbucket).
2. In the [Vercel dashboard](https://vercel.com) click **Add New → Project**, import the repo.
3. **Root Directory:** `/` (the monorepo root — the workspace root `package.json` drives installs/builds).
4. **Framework Preset:** Next.js (auto-detected).

### 9.2 Important monorepo settings

- **Install Command:** `npm install`
- **Build Command:** `npm run build --workspace @400faqs/web`
  (If Vercel auto-detects the root build, keep it; otherwise override as shown.)
- **Output:** Vercel uses its own Next.js runner; the `output: "standalone"` in
  `next.config.mjs` is harmless on Vercel.

### 9.3 Environment variables (set in Vercel)

Set these for the **web** project (Production, Preview, Development):

| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | `https://your-api.example.com` |
| `NEXT_PUBLIC_WEB_URL` | `https://your-web.vercel.app` |
| `NEXT_PUBLIC_SITE_NAME` | `400faqs` |

> `NEXT_PUBLIC_*` values are inlined into the client bundle at build time. If you
> change them, redeploy.

### 9.4 Deploy

Click **Deploy**. Vercel builds the workspace, runs `next build`, and serves the site.

- Public site: `https://your-web.vercel.app`
- Admin: `https://your-web.vercel.app/admin`

### 9.5 CORS

On your **API** host, set `CORS_ORIGINS` to include your Vercel domain(s), e.g.:

```env
CORS_ORIGINS=https://your-web.vercel.app,https://your-custom-domain.com
```

### 9.6 Custom domain

In Vercel → **Project → Settings → Domains**, add and verify your custom domain.
Then update `NEXT_PUBLIC_WEB_URL`, `API_URL`, and `CORS_ORIGINS` accordingly.

---

## 10. Deploying the API + workers + database (outline)

Vercel is ideal for the web, but the **API, worker, Postgres, and Redis** need a
runtime. Choose one:

- **Supabase / Neon**: free Postgres. Put the connection string in `DATABASE_URL`.
- **Upstash / Redis Cloud**: managed Redis. Put it in `REDIS_URL`.
- **API/worker host**: Render, Railway, Fly.io, a VPS, or Docker — run §8.

Recommended split:

| Piece | Recommendation |
|-------|----------------|
| Web (Next.js) | Vercel |
| API (Express) | Render / Railway / Fly / VPS |
| Worker (BullMQ) | Render background worker / Railway / K8s (scale separately) |
| Postgres | Supabase / Neon |
| Redis | Upstash / Redis Cloud |

Deploy order (so the web can reach the API):
1. Provision Postgres + Redis.
2. Run `migrate deploy` + `npm run db:seed` (from a machine with the DB URL).
3. Deploy the **API** (with workers), verify `/` health.
4. Deploy the **web** to Vercel with `NEXT_PUBLIC_API_URL` set.
5. Configure WhatsApp Cloud API + Google AI keys on the API host.

---

## 11. WhatsApp Business Cloud API (production)

The bot is a WhatsApp Cloud API client.

1. Create a Meta app on [developers.facebook.com](https://developers.facebook.com).
2. Obtain a **WhatsApp Business Account (WABA)** and a **phone number id**.
3. Generate a **permanent access token** (system user with the right permissions).
4. Fill in: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`,
   and a strong `WHATSAPP_VERIFY_TOKEN`.
5. In the Meta app dashboard → **Webhooks**, set the callback URL to
   `https://your-api.example.com/api/webhooks/whatsapp` and the verify token you
   chose. Meta will send a GET verification (handled automatically) then POST events.
6. The admin **WhatsApp** tab can test-send and check connection status.
7. Message templates are owned by Meta; 400faqs syncs them **read-only**
   (`POST /api/admin/whatsapp/templates/sync`).

---

## 12. Google AI (Gemini) for duplicate detection

Set `GOOGLE_AI_API_KEY` (e.g. from [aistudio.google.com](https://aistudio.google.com)).
Without it, contributions are still moderated by deterministic heuristics and
similar questions are routed to manual review (never silently auto-approved).

---

## 13. Common tasks (reference)

```bash
npm install                 # install all workspaces
npm run db:generate         # prisma generate (root, loads root .env)
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma  # apply migrations
npm run db:push             # push schema (no migration history)
npm run db:seed             # seed settings + Super Admin
npm run dev:api             # run API (+ workers in dev)
npm run dev:web             # run web
npm run dev                 # API + web together
npm run build               # build all workspaces
npm run typecheck           # tsc across workspaces
npm run lint                # eslint across workspaces
```

---

## 14. Troubleshooting

- **`P1012 Environment variable not found: DATABASE_URL`** — run the command from the
  **repo root** (not `packages/db`) so Prisma reads the root `.env`, or export
  `DATABASE_URL` in your shell.
- **`P1001 Can't reach database server`** — confirm the `DATABASE_URL` host is
  reachable, the port/security rules allow your IP, and the password is URL-encoded.
- **`ECONNREFUSED localhost:6379`** — Redis isn't running (start `docker compose up -d`).
- **Web can't reach API in production** — check `NEXT_PUBLIC_API_URL` is set on the
  web host and the API is reachable/HTTPS + CORS.
- **Admin login fails with 401** — seed the Super Admin (`npm run db:seed`) and use
  the `ADMIN_EMAIL`/`ADMIN_PASSWORD`; ensure a strong `JWT_SECRET` on the API host.
- **`.env` not tracked by git** — correct: it is gitignored. Use `.env.example` as a
  reference and never commit secrets.

---

*400faqs — WhatsApp-powered multiplayer questions game. Local, self-hosted, or on
Vercel.*
