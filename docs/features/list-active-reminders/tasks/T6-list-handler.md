---
id: T6
title: "/list command handler — render the single Active-list message (+ empty message)"
layer: "ports"
deps: ["T4"]
acs: ["AC-01", "AC-02", "AC-05", "AC-08"]
files_hint: ["src/ports/handlers/list-handler.ts", "src/ports/dto/index.ts"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T6 — /list command handler

## Why

Renders the use-case view model into exactly one Telegram message. Derives from [spec §AC-01/AC-02/AC-05/AC-08](../spec.md), [sad §6 flow 1 + flow 3 + cross-cutting](../sad.md), [sad §8 crosscutting](../sad.md).

## What

New `src/ports/handlers/list-handler.ts` (the `/list` command path): call T4, render one message — rows with per-row cancel + go-to-source inline buttons (encode action tag + `reminder_id` in `callback_data` ≤ 64 bytes, reuse the fired-reminder scheme), fire time as absolute local date-time in the Owner's `/settings` tz (reuse `tz-utils`), or the no-active-reminders message when empty. Gate the command with the existing owner middleware (`src/ports/middleware/auth-middleware.ts`) — non-Owner reveals nothing (AC-05). Append the "… ще M" overflow suffix from the view model (AC-08). Callback wiring is T7; registration is T8.

## Definition of Done

- [ ] Integration test: `/list` sends exactly **one** message (send-count = 1), populated and empty cases.
- [ ] Unit test: fire time rendered in the Owner's configured tz; preview bounded.
- [ ] Unit/integration: non-Owner `/list` reveals nothing.
- [ ] lint + vet clean.

## Notes

Hard rule: exactly 1 message per `/list` (spec §6). Shares the `list-handler.ts` lane with T7 (overlapping `files_hint` → serialized).
