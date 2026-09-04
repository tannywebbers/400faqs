# Supabase Edge Functions — 400faqs

## Deploy

From the project root (with the Supabase CLI installed and linked):

```bash
supabase functions deploy housekeeping
```

Or via the Supabase Dashboard → Edge Functions → Deploy.

## Trigger

The `housekeeping` function is designed to be called every 5 minutes by an
external cron tool or Supabase's built-in `pg_cron`.

### Option A — External cron (recommended)

Point your external cron service at:

```
POST https://<PROJECT_REF>.supabase.co/functions/v1/housekeeping
Authorization: Bearer <ANON_KEY>
Content-Type: application/json
```

Body: `{}`

### Option B — pg_cron (built into Supabase)

Run `supabase/cron-housekeeping.sql` in the Supabase SQL editor after
replacing `<PROJECT_REF>` and `<ANON_KEY>` with your project's values.

## What it does

1. **Stuck-notification recovery** — Notifications stuck in `SENDING` for >15 min → `FAILED`
2. **Session sweep** — Expire `WAITING` sessions past `expiresAt`; time-out `ACTIVE` sessions past `turnTimeoutMinutes × 2`
3. **Monetization gate reconciliation** — `PENDING` gates past `expiresAt`: `EXPIRED` if session active, `CANCELLED` if not
4. **Retention cleanup** — Delete `ProcessedEvent` rows >7 days; delete `AuditLog` LOGIN rows >30 days
5. **Timestamp** — Updates `system.lastCronRun` setting

All operations are idempotent and safe to run repeatedly.
