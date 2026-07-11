# Deployment: webhook + wake mode

The bot no longer long-polls Telegram or runs an in-process timer (ADR-0001).
It runs a `node:http` server (ADR-0002) with two endpoints — a Telegram
webhook and a wake endpoint an external scheduler calls on a fixed interval —
so the Fly.io machine can idle-stop between calls and start back up on the
next inbound request.

## Required environment variables

| Variable | Example | Purpose |
|---|---|---|
| `BOT_TOKEN` | `123456:ABC-DEF...` | Telegram bot token (unchanged from long-polling mode) |
| `OWNER_TELEGRAM_ID` | `111111111` | The Owner's Telegram user id |
| `DB_PATH` | `/data/reminders.db` | SQLite file path |
| `PORT` | `3000` | Port the HTTP server listens on — must match `fly.toml`'s `[http_service].internal_port` |
| `WEBHOOK_URL` | `https://mp-tg-reminder.fly.dev/webhook/telegram` | The public URL Telegram will POST updates to; registered via `setWebhook` on every boot |
| `WEBHOOK_SECRET_TOKEN` | a random 32+ char string | Verified against Telegram's `X-Telegram-Bot-Api-Secret-Token` header (constant-time compare); reject 401 if missing/wrong (AC-04) |
| `WAKE_BEARER_TOKEN` | a random 32+ char string | Static bearer token the external scheduler sends as `Authorization: Bearer <token>` when calling `POST /wake`; verified constant-time (AC-04) |
| `WAKE_INTERVAL_MS` | `300000` (deployed value; default 3 min) | The external scheduler's wake cadence in ms — drives the AC-03 "delivery may be late" estimate. **Keep this equal to the interval the external cron actually uses** so the estimate the Owner sees matches reality; if you retune the cron, update this too |

Generate the two secret tokens once, e.g.:

```sh
openssl rand -hex 32
```

## One-time setup

`main.ts` calls `bot.api.setWebhook(WEBHOOK_URL, { secret_token: WEBHOOK_SECRET_TOKEN })`
on every boot, so there is no separate manual `setWebhook` step to run — deploying
with the env vars above set is sufficient. To verify it took effect:

```sh
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

`url` should match `WEBHOOK_URL` and `pending_update_count` should trend to 0
after a message is sent to the bot.

## External wake scheduler

Configure whatever external scheduler you use (a cron-based HTTP pinger, a
platform's scheduled-job feature, etc.) to call:

```
POST https://<fly-app>.fly.dev/wake
Authorization: Bearer <WAKE_BEARER_TOKEN>
```

**Do not rely on GitHub Actions' `schedule` trigger as the primary
scheduler** — GitHub explicitly documents that scheduled workflow runs can
be delayed or dropped under load, and low-activity/private repos are
throttled hardest (observed in practice: gaps of 1-3+ hours instead of the
configured 5 minutes). Use a dedicated cron service instead (e.g.
cron-job.org, free, ~1 minute accuracy). `.github/workflows/wake.yml` is
kept only as a low-frequency backup (hourly) in case the primary service
has an outage — duplicate `/wake` calls are harmless (AC-06).

**Cadence: every 5 minutes** in the current deployment (cron-job.org's
practical scheduling granularity) — wider than the 3-minute interval
originally chosen in `sad.md` §8 to leave headroom under the ≤5 min p95
delivery-delay target once the ~15s p95 cold-start latency is added
(spec.md §6). `WAKE_INTERVAL_MS=300000` is kept in sync so the AC-03
estimate stays honest; tighten the cron job to 3 minutes instead if the
p95 headroom matters more than the external scheduler's cost/complexity.
Each call invokes `Scheduler.tick()` (`FireDueReminders` +
`ExpireStalePrompts`) and only returns once it fully resolves (AC-01b) —
the machine is not allowed to idle again mid-tick.

A missed wake cycle (scheduler outage) never loses a reminder — the next
successful call catches up every reminder that became due in the gap, with
no cutoff (AC-07). It does mean delivery is delayed until the scheduler
resumes, so the external scheduler's own uptime is now part of the bot's
effective reliability.

## Redeploying from scratch

1. Set the six env vars above (`fly secrets set BOT_TOKEN=... OWNER_TELEGRAM_ID=... WEBHOOK_URL=... WEBHOOK_SECRET_TOKEN=... WAKE_BEARER_TOKEN=...` — `DB_PATH` and `PORT` already default via `fly.toml`).
2. Deploy (`fly deploy`) — `main.ts` re-registers the webhook on boot.
3. Point the external scheduler at `POST /wake` with the bearer token, every 5 minutes (or 3 minutes for tighter p95 headroom — keep `WAKE_INTERVAL_MS` in sync either way).
4. Confirm `getWebhookInfo` shows the expected `url` and a draining `pending_update_count`.
