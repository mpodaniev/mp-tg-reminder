---
id: T12
title: "In-process polling-tick scheduler worker"
layer: "ports"
deps: ["T06", "T09"]
acs: ["AC-04"]
files_hint:
  - src/scheduler/scheduler.ts
  - src/scheduler/__tests__/scheduler.test.ts
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T12 — In-process polling-tick scheduler worker

## Why

The bot uses a polling-tick scheduler ([ADR-0004](../adr/0004-polling-tick-scheduler.md)) to fire due reminders — a `setInterval`-based in-process worker that calls `FireDueReminders` every ~15 seconds. It also calls `ExpireStalePrompts` on each tick to clean up 24h-old `awaiting_time` reminders (spec §8 OQ-3).

## What

**`Scheduler`** class (`src/scheduler/scheduler.ts`):
- Constructor: takes `FireDueReminders`, `ExpireStalePrompts` use cases + `intervalMs` (default `15_000`; injected from env `SCHEDULER_INTERVAL_MS`).
- `start()` — sets up `setInterval`; each tick:
  1. Calls `fireDueReminders.execute({ now: Date.now() })`.
  2. Calls `expireStalePrompts.execute({ cutoff: Date.now() - 24 * 60 * 60 * 1000 })`.
  3. Logs errors per-reminder without crashing the tick.
- `stop()` — clears the interval; called on `SIGTERM`/`SIGINT` in `main.ts` (T13).

The scheduler has no direct knowledge of SQLite or grammY — it operates only through the injected use cases.

## Definition of Done

- [ ] Unit test: `start()` triggers `FireDueReminders` on each tick with correct `now` timestamp (AC-04)
- [ ] Unit test: `ExpireStalePrompts` called on each tick with 24h cutoff
- [ ] Unit test: one-reminder error does not stop subsequent tick execution
- [ ] `stop()` clears the interval (no tick after stop)
- [ ] Fire timing: tick interval ≤ 15s → reminder fires within ±60s of scheduled time (NFR spec §6)
- [ ] lint + vet clean

## Notes

Derives from [ADR-0004](../adr/0004-polling-tick-scheduler.md), [spec §5 AC-04](../spec.md), [spec §6 fire-accuracy NFR](../spec.md). The ±60s accuracy NFR is satisfied by the 15s tick interval — no additional mechanism needed. The `SCHEDULER_INTERVAL_MS` env var (set in `.env.example`, T01) allows tuning without code changes.
