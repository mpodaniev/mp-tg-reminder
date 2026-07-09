# Changelog — webhook-cron-wake

## webhook-cron-wake — bot moves from long-polling to webhook + external wake

**What:** The bot no longer keeps a machine busy 24/7 long-polling Telegram and
running an in-process 15-second timer. It now runs a `node:http` server with two
authenticated inbound endpoints — a Telegram **webhook** (`POST /webhook/telegram`)
and a **wake** endpoint (`POST /wake`) that an external scheduler calls on a fixed
interval to trigger a due-reminders check — so the Fly.io machine can idle-stop
between calls and start back up on the next inbound request. The same pass closes
four pre-existing reliability/authorization gaps: a centralized Owner-auth gate on
every handler (not only callback queries), a durable "awaiting custom time" prompt
that survives a restart, state-based idempotent delivery so a retried check never
double-sends, and a graceful shutdown that drains an in-flight tick before closing
the DB.

**Why:** The trigger was a Fly.io billing look, but research confirmed the near-term
dollar saving is $0 (bill already under Fly's free-billing floor), so the feature is
reframed as **reliability/hygiene hardening**, not cost reduction — see
[spec](spec.md) §1/§2. Fly's idle-stop only tracks inbound HTTP, which the old
long-poll design never produced; and no platform can wake a process at an arbitrary
future minute, so an external periodic caller is the only workable pattern
([ADR-0001](adr/0001-wake-call-as-sole-trigger.md)). Inbound endpoints are served by
raw `node:http`, not a framework ([ADR-0002](adr/0002-raw-http-for-inbound-endpoints.md)),
and authorization is enforced once at router dispatch
([ADR-0003](adr/0003-centralized-owner-auth-gate.md)).

**How to use:**
- Telegram → `POST /webhook/telegram`, verified against the
  `X-Telegram-Bot-Api-Secret-Token` header (constant-time). Registered automatically
  via `setWebhook` on every boot.
- External scheduler → `POST /wake` with `Authorization: Bearer <WAKE_BEARER_TOKEN>`,
  **every 3 minutes**. The call runs `Scheduler.tick()` (fire due reminders + expire
  stale prompts) and only returns once the tick fully resolves.
- Full setup, env vars, and verification steps: [README.md](README.md);
  contract: [contracts/openapi.yaml](contracts/openapi.yaml).

**Operational notes:**
- Migration: `migrations/04_create_pending_prompt.up.sql` — adds the durable
  `pending_prompt` table; applied on deploy via `npm run migrate:up`, reverts cleanly
  with `04_create_pending_prompt.down.sql`.
- Config: six required env vars (`BOT_TOKEN`, `OWNER_TELEGRAM_ID`, `WEBHOOK_URL`,
  `WEBHOOK_SECRET_TOKEN`, `WAKE_BEARER_TOKEN`, plus `DB_PATH`/`PORT` defaulted in
  `fly.toml`) and one optional `WAKE_INTERVAL_MS` (default 3 min) — **keep it equal
  to the real cron cadence** so the AC-03 "may be late" estimate matches reality.
  Rotate `WEBHOOK_SECRET_TOKEN`/`WAKE_BEARER_TOKEN` independently at any time.
- Rollback: `npm run migrate:down` + redeploy the previous long-polling build. Note
  the external scheduler must then be disabled, and long-polling re-registered by
  the old boot path (webhook is cleared by Telegram once polling resumes).
- Reliability caveat: a missed wake cycle never loses a reminder (the next successful
  call catches up every due reminder, no cutoff — AC-07), but delivery is delayed
  until the scheduler resumes, so the external scheduler's uptime is now part of the
  bot's effective reliability.

**Acceptance criteria delivered:** AC-01 (idle machine still delivers within the
delay bound), AC-01b (tick drains before idle), AC-02 (chat behavior unchanged),
AC-03 (honest "may be late" estimate from the real wake interval), AC-04 + AC-04b
(both endpoints reject non-Telegram/non-scheduler callers; every handler denies a
non-Owner sender), AC-05 (custom-time prompt survives a restart), AC-06 (idempotent,
no double delivery), AC-07 (catch-up after a wake-source gap, none lost).

## webhook-cron-wake — 2026-07-09 fix: deploy fails loudly on a non-serving boot

**What:** Adds an unauthenticated `GET /health` → 200 liveness route and a matching
Fly `[[http_service.checks]]` block, so a release whose process crash-loops on boot
(e.g. a missing required secret) fails the `fly deploy` instead of reporting success.

**Why:** `fly.toml` had no health check and `restart.policy = on-failure` masked the
crash, so a non-serving release (v11, missing secrets) went green and was only caught
by hand. See [spec](spec.md) AC-08 and
[_fixes/2026-07-09-deploy-liveness-healthcheck.md](_fixes/2026-07-09-deploy-liveness-healthcheck.md).

**How to use:** No action needed — `GET /health` is automatic and unauthenticated;
Fly's proxy probes it every 15s (`grace_period` 10s) once a machine is running. It
does not run against a stopped machine, so scale-to-zero is unaffected.

**Operational notes:**
- Migration: none.
- Config: none (no new env var).
- Rollback: revert the commit; `fly.toml` reverts to no health check (loses the
  loud-failure guarantee, does not affect runtime behavior).

**Acceptance criteria delivered:** AC-08 (a non-serving release is reported failed,
not green; scale-to-zero preserved).
