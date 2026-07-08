---
id: T4
title: "Telegram gateway: drop the Done button from the fired-reminder keyboard"
layer: "infra"
deps: []
acs: ["AC-06"]
files_hint: ["src/infra/telegram/grammy-telegram-gateway.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T4 — Telegram gateway: drop the Done button from the fired-reminder keyboard

## Why

Derives from [spec §US-05](../spec.md), [sad §5 point 2](../sad.md), [ADR-0001](../adr/0001-retire-done-action-with-graceful-stale-callback.md). Only Snooze and Delete should remain on newly sent fired-reminder messages.

## What

- `src/infra/telegram/grammy-telegram-gateway.ts` — remove the `✅ Done` button from the fired-reminder inline keyboard builder; keep Snooze and Delete.
- Independent of the domain/app guard (T5) — this only changes what's rendered on *new* messages; old messages already sent keep their live `done:<id>` callback, handled by T5/T6.

## Definition of Done

- [ ] unit test on the keyboard builder: fired-reminder keyboard contains only Snooze and Delete
- [ ] lint + vet clean

## Notes

Parallel branch — no dependency on T1/T2/T3; can start immediately alongside T5.
