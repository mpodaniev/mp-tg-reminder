---
slug: webhook-cron-wake
date: 2026-07-09
triage: gap
acs: [AC-08]
commit: 586bc103adebbe442a1acfc2c440dbb90e877c65
recurrence_of: none
---

# Fix: fly deploy reports success even when the app crash-loops on startup

## Symptom

Doing `fly deploy` when a required secret is missing, expected the deploy to fail
loudly (a non-serving release must not go green), got `fly deploy` completing
successfully while the app never served. Scope: any deploy of a boot that hard-exits
on missing required env (`BOT_TOKEN`, `OWNER_TELEGRAM_ID`, `WEBHOOK_URL`,
`WEBHOOK_SECRET_TOKEN`, `WAKE_BEARER_TOKEN`); observed on release v11 (missing
secrets), caught only by a manual `flyctl status` + curl.

## Root cause

`fly.toml`'s `[http_service]` had no health check, and the machine's
`restart.policy = on-failure` (max_retries 10) absorbs the crash. When `src/main.ts`
validates env and calls `process.exit(1)`, the port never opens, but nothing signals
the deploy as broken, so Fly reports the release green. It slipped past the test suite
because deploy-time liveness is a config/CI-time property — there was no health
endpoint to probe and no `fly.toml` check to probe it, so no level of the test suite
could observe a non-serving release.

## The pinning test

`src/ports/http/__tests__/server.test.ts` — unit — "returns 200 for GET /health
without auth and without invoking any handler". RED run before the fix:
`AssertionError: expected 404 to be 200` at `server.test.ts:47`. The unit test pins
the endpoint (liveness route exists and is unauthenticated); the `fly.toml`
`[[http_service.checks]]` block is the deploy-time mechanism that turns a
never-listening port into a failed `fly deploy` (verified at ship/deploy time, not by
a unit test).

## Spec patch

(c) gap — new AC added to spec.md §5:

> AC-08 — deploy liveness `<!-- added-by-fix: 2026-07-09 -->`
> **Given** a release is deployed but the process cannot serve requests (e.g. it
> crash-loops on a missing required secret and never opens its port)
> **When** the deploy completes
> **Then** the deploy is reported as failed rather than successful — a non-serving
> release must not go green — via a platform liveness check against an
> unauthenticated health endpoint, without keeping a scale-to-zero machine
> perpetually running

## Follow-ups

- Optional: add a `/health` assertion to `test/integration/webhook-wake-perimeter.test.ts`
  for an end-to-end perimeter guard (unit coverage is sufficient for now).
- Delete `docs/features/webhook-cron-wake/DEPLOY-HEALTHCHECK-FIX-BRIEF.md` — the
  handoff brief is superseded by this fix record.
