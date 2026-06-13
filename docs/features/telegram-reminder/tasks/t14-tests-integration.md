---
id: T14
title: "Integration tests: restart durability + fire accuracy + E2E capture→fire→resolve"
layer: "tests"
deps: ["T13"]
acs: ["AC-02", "AC-04", "AC-05", "AC-06"]
files_hint:
  - test/integration/durability.test.ts
  - test/integration/fire-accuracy.test.ts
  - test/integration/e2e-capture-fire-resolve.test.ts
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T14 — Integration tests: restart durability + fire accuracy + E2E capture→fire→resolve

## Why

Unit tests verify logic in isolation. These integration tests verify the cross-cutting guarantees that are hardest to test in isolation: at-least-once delivery across a crash (ADR-0005, spec §2 "zero data loss"), fire timing accuracy (spec §6 NFR), and the full Owner journey end-to-end.

## What

**`durability.test.ts`** — at-least-once delivery across restart:
1. Schedule a reminder → transitions to `pending`.
2. Manually set `state = 'firing'` (simulates a mid-fire crash before Telegram ack).
3. Instantiate a fresh `FireDueReminders` with a fake gateway.
4. Call `fireDueReminders.execute({ now: Date.now() })`.
5. Assert: the `firing`-state reminder was re-fired; `delivered_at` is set; `state = 'fired'`.
6. Assert: a second call with the same `now` does NOT re-fire an already-`fired` reminder (de-dup).

**`fire-accuracy.test.ts`** — timing window:
1. Schedule a reminder `scheduledAt = now + 100ms`.
2. Use a real `Scheduler` with `intervalMs = 50ms` (accelerated).
3. Start the scheduler; wait up to 500ms for `state = 'fired'`.
4. Assert: `fired_at - scheduled_at <= 60_000` (spec §6 ±60s NFR) — with the 50ms interval this is trivially satisfied; the test documents the invariant.

**`e2e-capture-fire-resolve.test.ts`** — full Owner journey:
1. `CaptureMessage` (via fake update with Owner ID + forwarded message) → `awaiting_time`.
2. `ScheduleReminder` with quick-pick time → `pending`.
3. Advance virtual clock; `FireDueReminders` → `fired` + `firedMessageId` set.
4. `SnoozeReminder` with new time → `pending` again (AC-05).
5. Re-fire → `fired`.
6. `ResolveReminder('done')` → `done` (AC-06).
7. Assert: non-Owner update discarded (AC-09 re-verified at integration level).

Uses real SQLite (`:memory:`) + fake `TelegramGateway`.

## Definition of Done

- [ ] Durability test: `firing`-state reminder is re-fired after "restart" (ADR-0005 invariant)
- [ ] Durability test: already-`fired` reminder is NOT re-fired (no duplicate delivery)
- [ ] Fire-accuracy test: `fired_at - scheduled_at` within ±60s (spec §6 NFR)
- [ ] E2E test: full capture→fire→snooze→re-fire→done journey passes on real SQLite `:memory:`
- [ ] Non-Owner discarded at integration level (AC-09)
- [ ] All 3 test files pass under `npm test`
- [ ] lint + vet clean

## Notes

Derives from [spec §2 Goals](../spec.md), [spec §6 NFR](../spec.md), [ADR-0005](../adr/0005-at-least-once-delivery.md). Use `:memory:` SQLite — no file I/O in tests. The "restart" in the durability test is simulated by re-instantiating use cases against the same in-memory DB — no actual process restart needed.
