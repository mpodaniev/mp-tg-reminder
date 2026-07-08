---
id: T7
title: "Centralize Owner authorization in a single router-dispatch gate (ADR-0003)"
layer: "ports"
deps: ["T6"]
acs: ["AC-04b"]
files_hint: ["src/ports/router.ts", "src/ports/middleware/auth-middleware.ts", "src/ports/__tests__/router-auth.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T7 — Centralize Owner authorization in a single router-dispatch gate (ADR-0003)

## Why

[ADR-0003](../adr/0003-centralized-owner-auth-gate.md) and [AC-04b](../spec.md) require every handler that touches Owner data — not only `callback_query` as today — to deny a non-Owner sender. [sad.md §4 decision 4](../sad.md) centralizes this in one gate at dispatch.

## What

In `buildRouter`'s `handleUpdate` (`src/ports/router.ts`), call the existing `isOwner()` helper (`src/ports/middleware/auth-middleware.ts`) once, before any handler branch runs (forwarded message, pending custom-time text, `/list`, `/settings`, `callback_query`). A non-Owner sender causes a silent no-op (no reply, no state change) on every path, matching AC-04b's "no action taken" wording. Remove the now-redundant inline `callbackSenderId !== ownerChatId` check inside the `callbackQuery` branch.

## Definition of Done

- [ ] A single `isOwner()` call gates all of `handleUpdate`, before any branch
- [ ] The [T6](./t6-router-characterization-tests.md) tests for Owner-sender happy paths still pass unchanged
- [ ] New tests show the forwarded-message and custom-time-text paths now deny a non-Owner sender (closing the gap T6 documented)
- [ ] lint + vet clean

## Notes

Shares `src/ports/router.ts` with [T8](./t8-durable-pending-prompt-router.md) — `implement` should serialize T7 before T8 on that file (T8's `deps` already includes T7).
