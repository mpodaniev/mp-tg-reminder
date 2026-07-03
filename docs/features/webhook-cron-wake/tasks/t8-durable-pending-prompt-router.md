---
id: T8
title: "Replace the in-memory pendingCustom map with the durable PendingPromptRepository"
layer: "ports"
deps: ["T3", "T7"]
acs: ["AC-05"]
files_hint: ["src/ports/router.ts", "src/ports/__tests__/custom-time-conversation.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T8 — Replace the in-memory pendingCustom map with the durable PendingPromptRepository

## Why

[AC-05](../spec.md) requires the "awaiting custom time" prompt to survive a machine restart. [sad.md §5 decision 2](../sad.md) replaces the module-level `pendingCustom` Map (`src/ports/router.ts:19`) with the [T3](./t3-sqlite-pending-prompt-repository.md) repository.

## What

In `src/ports/router.ts`:
- `handleQuickPick`'s and `handleSnoozePick`'s `custom` branches call `savePendingPrompt()` instead of `pendingCustom.set()`
- `handleUpdate`'s pending-check (`pendingCustom.has(senderId)`) calls `findPendingPrompt()` instead
- `handleCustomTimeInput` calls `clearPendingPrompt()` on success, and re-saves (not re-sets) on a parse failure/past-time retry, instead of `pendingCustom.delete()`/`.set()`
- Per spec §8 default: an intervening forward (a new `capture`) overwrites (upserts) any existing pending prompt rather than queuing alongside it

## Definition of Done

- [ ] A test that persists a pending prompt, then constructs a **new** router instance against the same DB (simulating a restart — no shared in-memory state), shows the next reply is still recognized as the awaited custom time (AC-05)
- [ ] The existing `custom-time-conversation.test.ts` happy-path/parse-failure/past-time cases pass unchanged in behavior
- [ ] An intervening forward while a prompt is pending replaces it (new pending prompt wins), per spec §8
- [ ] lint + vet clean

## Notes

Shares `src/ports/router.ts` with [T7](./t7-centralize-owner-auth-gate.md) — this task's `deps` list T7 so `implement` serializes them in order on that file.
