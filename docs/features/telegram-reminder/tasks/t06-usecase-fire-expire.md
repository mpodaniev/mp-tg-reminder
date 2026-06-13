---
id: T06
title: "Use cases: FireDueReminders + ExpireStalePrompts"
layer: "app"
deps: ["T04"]
acs: ["AC-04", "AC-12"]
files_hint:
  - src/app/use-cases/fire-due-reminders.ts
  - src/app/use-cases/expire-stale-prompts.ts
  - src/app/use-cases/__tests__/fire-due-reminders.test.ts
  - src/app/use-cases/__tests__/expire-stale-prompts.test.ts
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T06 — Use cases: FireDueReminders + ExpireStalePrompts

## Why

These use cases implement the proactive side: firing reminders at scheduled time and expiring captures where the Owner never responded. Both are invoked by the in-process scheduler (T12). At-least-once delivery semantics are implemented here ([ADR-0005](../adr/0005-at-least-once-delivery.md)).

## What

**`FireDueReminders`** — input: `{ now: number }`:
1. `repo.findDuePending(now)` — query: `state=pending AND scheduled_at<=now` (also re-collects `state=firing` rows from a prior crash, per ADR-0005).
2. For each due reminder:
   a. `transition(reminder, { type: 'start_fire' })` → `firing`.
   b. `repo.update(reminder)` — persists `firing` state **before** sending (crash-safe checkpoint).
   c. `repo.findWithSnapshot(reminder.id)` to get snapshot.
   d. If `snapshot.isMediaProtected`, attach note to text (AC-12 — fire with text + note, all buttons present).
   e. `gateway.sendReminder(ownerChatId, snapshot, reminder.id)` → `{ messageId }`.
   f. `transition(reminder, { type: 'delivered', firedMessageId, deliveredAt: Date.now() })` → `fired`.
   g. `repo.update(reminder)` — persists `fired + delivered_at`.
3. Return `{ fired: number, errors: Error[] }` — collect per-reminder errors without stopping the loop.

**`ExpireStalePrompts`** — input: `{ cutoff: number }` (typically `now - 24h`):
1. `repo.findAwaitingExpired(cutoff)`.
2. For each: `transition(reminder, { type: 'expire' })` → `expired`; `repo.update(reminder)`.
3. (Notification to Owner is handled by the conversation layer in T10, not here.)

## Definition of Done

- [ ] `FireDueReminders` unit test (fake repo + fake gateway): marks `firing` before `sendReminder`, then `fired` after ack — order verified
- [ ] Crash simulation: if `sendReminder` throws, reminder stays `firing`; next invocation re-fires it (at-least-once invariant, ADR-0005)
- [ ] `FireDueReminders` fires with text + protection note when `isMediaProtected=1`; all 4 buttons still present (AC-12)
- [ ] `ExpireStalePrompts` unit test: transitions `awaiting_time` reminders older than cutoff to `expired`
- [ ] Per-reminder errors collected; one failing reminder does not block others
- [ ] lint + vet clean

## Notes

Derives from [spec §5 AC-04, AC-12](../spec.md), [sad §6 Flows 2 and 5](../sad.md), [ADR-0005](../adr/0005-at-least-once-delivery.md). The `firing`-state re-fire on restart is the core at-least-once guarantee — T14 integration test verifies this with a simulated crash. Owner `chatId` must be passed in or resolved from `ownerSettings`; determine injection strategy at implementation time (simplest: pass `ownerChatId` as a constructor arg).
