---
id: T1
title: "Add pending→deleted (cancel) transition + invalid-transition sentinel to the state machine"
layer: "domain"
deps: []
acs: ["AC-03", "AC-04"]
files_hint: ["src/domain/state-machine.ts", "src/domain/errors.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T1 — pending→deleted (cancel) transition + sentinel

## Why

The cancel action needs a lifecycle move that does not exist yet. Derives from [spec §AC-03/AC-04](../spec.md), [sad §6 flow 2](../sad.md), [ADR-0001](../adr/0001-reuse-deleted-state-for-cancel.md) — reuse the `deleted` terminal state rather than add `cancelled`.

## What

In `src/domain/state-machine.ts`, allow the `pending → deleted` transition (cancel). Every non-`pending` source state (`firing`, `fired`, `done`, `deleted`, `expired`) must be rejected with a domain sentinel error in `src/domain/errors.ts` (follow the existing custom-error pattern) so the handler can map it to the uniform "no longer active" reply (AC-04). Pure domain — no I/O.

## Definition of Done

- [ ] Unit test: `pending → deleted` succeeds.
- [ ] Unit test: each non-`pending` source state is rejected with the sentinel error.
- [ ] No existing transition is changed.
- [ ] lint + vet clean.

## Notes

This intentionally reopens telegram-reminder Edit #8 (deletion was `fired`-only) — scoped to a `pending` source only; reschedule (`pending → pending`) is **not** added. Root task — parallel with T2.
