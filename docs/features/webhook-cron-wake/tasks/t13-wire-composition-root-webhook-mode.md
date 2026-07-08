---
id: T13
title: "Wire the HTTP adapter into the composition root; switch to webhook mode; graceful shutdown"
layer: "wiring"
deps: ["T8", "T9", "T11", "T12"]
acs: ["AC-01b", "AC-02"]
files_hint: ["src/main.ts", "fly.toml"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T13 — Wire the HTTP adapter into the composition root; switch to webhook mode; graceful shutdown

## Why

Brings every prior task together into the running process: [ADR-0001](../adr/0001-wake-call-as-sole-trigger.md) (no more `setInterval`), the new HTTP adapter ([T10](./t10-http-server-skeleton.md)/[T11](./t11-webhook-handler.md)/[T12](./t12-wake-handler.md)), and the graceful-shutdown drain ([sad.md §4 decision 5](../sad.md), [AC-01b](../spec.md)).

## What

In `src/main.ts`:
- Replace `bot.start()` (long-polling) with starting the `T10` HTTP server and calling `bot.api.setWebhook(url, { secret_token })` once at startup
- Remove `scheduler.start()` — the wake handler ([T12](./t12-wake-handler.md)) is the sole `tick()` caller now (ADR-0001)
- Update the `SIGTERM`/`SIGINT` handlers to `await scheduler.stop()` (now async per [T4](./t4-scheduler-public-tick-drain.md)) before calling `db.close()`, closing the AC-01b race window
- Read the new env vars: webhook secret token, wake bearer token, HTTP port
- Update `fly.toml` with an `http_service` block (internal port matching the server) so Fly.io's proxy can track inbound activity for idle-stop, per sad.md §7

## Definition of Done

- [ ] Starting the process registers the webhook (mockable in a test) instead of long-polling
- [ ] A `SIGTERM` sent mid-tick is only followed by `db.close()` after the tick resolves (integration test with a slow fake `tick()`)
- [ ] `AC-02` regression: forwarding a message and confirming a time still works end-to-end through the new webhook path with no behavior change from the Owner's perspective
- [ ] `fly.toml` declares `http_service` with the correct internal port
- [ ] lint + vet clean

## Notes

This is the integration point — it depends on every other production-code task (T8, T9, T11, T12) since `main.ts` wires all of them together.
