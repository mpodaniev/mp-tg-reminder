---
id: T6
title: "Resolve handler: map guarded done outcome to uniform 'no longer active' reply"
layer: "ports"
deps: ["T5", "T4"]
acs: ["AC-06"]
files_hint: ["src/ports/handlers/resolve-handler.ts", "src/ports/__tests__/resolve-handler.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T6 — Resolve handler: map guarded done outcome to uniform "no longer active" reply

## Why

Derives from [spec §AC-06](../spec.md), [sad §6 flow 2 / §8 crosscutting Error handling row](../sad.md), [ADR-0001](../adr/0001-retire-done-action-with-graceful-stale-callback.md). A stale tap on an old fired-reminder message's `done:<id>` button must not crash the bot and must not mark the reminder resolved.

## What

- `src/ports/handlers/resolve-handler.ts` — when `ResolveReminder` (T5) returns the not-active outcome for a `done` action, reply with the existing uniform "no longer active" message (same shape `list-handler.ts:114-126` already uses for cancel), answer the callback query, and return without touching `firedMessageId`/keyboard state.
- No new error-reply convention — reuse the existing uniform shape.

## Definition of Done

- [ ] integration test: a `done` callback against a `fired`-and-undeleted reminder replies with the uniform not-active message, does not crash, and the reminder's persisted state is unchanged
- [ ] lint + vet clean

## Notes

Depends on both T4 (new messages no longer offer Done) and T5 (the guard the handler delegates to). Covers the accepted-debt risk in `sad.md` §11 — old messages keep a live button indefinitely; this is the safety net.
