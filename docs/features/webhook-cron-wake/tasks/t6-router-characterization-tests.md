---
id: T6
title: "Characterize today's router dispatch + auth behavior before the gate refactor"
layer: "tests"
deps: []
acs: ["AC-04b"]
files_hint: ["src/ports/__tests__/router-auth.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T6 — Characterize today's router dispatch + auth behavior before the gate refactor

## Why

[sad.md §11](../sad.md) flags a regression risk: the router-auth refactor (T7) touches `src/ports/router.ts`, which the just-landed `list-active-reminders` feature also modified. Per the repo's TDD convention, pin today's behavior first — including the pre-existing gap that only `callback_query` checks the sender (`src/ports/router.ts:64`) while the forwarded-message and custom-time-text paths do not.

## What

Extend `src/ports/__tests__/router-auth.test.ts` to cover, as it behaves **today** (before T7's refactor):
- A forwarded message from a non-Owner sender is currently *not* denied (documents the gap AC-04b closes)
- The pending-custom-time text path from a non-Owner sender is currently *not* denied (same gap)
- `callback_query` from a non-Owner sender *is* already denied (today's one correct case)
- `/list` and `/settings` current behavior with a non-Owner sender

## Definition of Done

- [ ] Each characterization test documents today's actual behavior (including the gaps) with a comment linking to AC-04b as the reason it will change
- [ ] All new tests pass against the current, unmodified `router.ts`
- [ ] lint + vet clean

## Notes

This task intentionally does **not** fix the gap — that's T7. T7 depends on this task so the refactor has a safety net for the paths that must keep working (Owner-sender happy paths) while the gapped paths flip to denying.
