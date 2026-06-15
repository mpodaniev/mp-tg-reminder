---
id: T5
title: "CancelPendingReminder use-case — guard pending, transition, persist"
layer: "app"
deps: ["T1", "T2"]
acs: ["AC-03", "AC-04"]
files_hint: ["src/app/use-cases/cancel-pending-reminder.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T5 — CancelPendingReminder use-case

## Why

Orchestrates the cancel: load → guard → transition → persist. Derives from [spec §AC-03/AC-04](../spec.md), [sad §6 flow 2](../sad.md), [ADR-0001](../adr/0001-reuse-deleted-state-for-cancel.md).

## What

New `src/app/use-cases/cancel-pending-reminder.ts`: load the reminder by id via the port, apply the T1 `pending → deleted` transition. On success persist via `save` (the existing write). On any non-`pending` state, surface the T1 sentinel unchanged (the handler maps it to the uniform no-op — AC-04). No message editing (ADR-0002 immutable snapshot).

## Definition of Done

- [ ] Unit test: `pending` reminder → transitions to `deleted` and is persisted.
- [ ] Unit test: each stale end state → sentinel surfaced, no write.
- [ ] lint + vet clean.

## Notes

Mutating persist step (the only write in this feature) — flagged in sad §6. Depends on both roots (T1 transition, T2 port).
