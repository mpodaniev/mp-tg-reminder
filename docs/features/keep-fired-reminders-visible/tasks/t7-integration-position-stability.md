---
id: T7
title: "Integration test: position stable across fire/deliver/snooze; only delete removes"
layer: "tests"
deps: ["T2"]
acs: ["AC-03", "AC-04"]
files_hint: ["src/app/use-cases/__tests__/list-active-reminders.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T7 — Integration test: position stable across fire/deliver/snooze; only delete removes

## Why

Derives from [spec §AC-03/AC-04](../spec.md), [sad §6 flow 5](../sad.md). This is the dedicated domain-invariant test: firing, delivering, or snoozing a visible reminder must never change its list position or remove it; only an explicit delete does.

## What

- Extend `src/app/use-cases/__tests__/list-active-reminders.test.ts` (real ephemeral SQLite, fixed clock per `spec.md`'s integration strategy): seed a reminder, capture its list position, drive it through fire → deliver → snooze, re-list after each transition and assert the position is unchanged and it is still present; then delete it and assert it is gone from the next list.

## Definition of Done

- [ ] integration test: position unchanged after fire, deliver, and snooze transitions
- [ ] integration test: reminder is absent from the list only after explicit delete
- [ ] lint + vet clean

## Notes

Shares the same test file as T2's unit tests — serialize after T2 lands. Uses the fixed-clock + real-SQLite strategy already established for `list-active-reminders`.
