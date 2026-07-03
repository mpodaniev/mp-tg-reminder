---
id: T4
title: "Make Scheduler.tick() a public awaitable entry point; stop() awaits an in-flight tick"
layer: "app"
deps: []
acs: ["AC-01b"]
files_hint: ["src/scheduler/scheduler.ts", "src/scheduler/__tests__/scheduler.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T4 — Make Scheduler.tick() a public awaitable entry point; stop() awaits an in-flight tick

## Why

[ADR-0001](../adr/0001-wake-call-as-sole-trigger.md) makes the wake call the sole trigger for due-reminder checks — `tick()` must become an externally callable method. [sad.md §4 decision 5](../sad.md) requires `stop()` to await any in-flight tick before returning, closing [AC-01b](../spec.md).

## What

In `src/scheduler/scheduler.ts`:
- Remove the `setInterval`/`start()` machinery entirely (ADR-0001 — no fallback timer is kept)
- Promote `tick()` from `private` to a `public async tick(): Promise<void>` method
- Track the in-flight tick's promise; `stop()` becomes `async` and `await`s it before resolving, so a caller awaiting `stop()` knows no tick is still running

## Definition of Done

- [ ] Unit test: calling `tick()` directly (no interval) runs fire+expire and resolves
- [ ] Unit test: calling `stop()` while a tick is in flight resolves only after that tick completes
- [ ] `setInterval`/`clearInterval` no longer appear in `scheduler.ts`
- [ ] lint + vet clean

## Notes

This is a pure refactor of `scheduler.ts` with no DB dependency — safe to run in parallel with T1/T2/T6/T9/T10. T12 (wake handler) and T13 (composition root) depend on this.
