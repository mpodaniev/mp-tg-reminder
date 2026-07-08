---
id: T5
title: "Resolve-reminder use-case: guard the done action before any domain call"
layer: "app"
deps: []
acs: ["AC-06"]
files_hint: ["src/app/use-cases/resolve-reminder.ts", "src/app/use-cases/__tests__/resolve-reminder.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T5 — Resolve-reminder use-case: guard the done action before any domain call

## Why

Derives from [spec §AC-06](../spec.md), [sad §5 point 2 / §6 flow 2](../sad.md), [ADR-0001](../adr/0001-retire-done-action-with-graceful-stale-callback.md). `fired → done` is a *valid* domain transition (`state-machine.ts`), so a still-fired-and-undeleted reminder would otherwise resolve successfully instead of being rejected — this guard must sit ahead of the domain call, not rely on catching an error from it.

## What

- `src/app/use-cases/resolve-reminder.ts` — in `ResolveReminder.execute`, intercept `input.action === "done"` **before** calling `reminder.resolveDone()`; return a "not active" outcome (reuse the shape the existing `InvalidStateTransitionError`/`ReminderNotFoundError` handling already produces) instead of invoking the domain transition at all.
- No change to `resolveDelete` or the domain's `state-machine.ts` — `done` stays defined but unreachable (ADR-0001).

## Definition of Done

- [ ] unit test: calling `execute({ action: "done" })` against a `fired` reminder returns the not-active outcome and does **not** mutate the reminder's state
- [ ] unit test: `resolveDone()` / the domain transition is never invoked for the `done` action (spy/assert no-call)
- [ ] lint + vet clean

## Notes

Parallel branch — no dependency on T1/T2/T3; can start immediately alongside T4. T6 depends on both T4 and T5.
