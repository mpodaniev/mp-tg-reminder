---
id: T10
title: "grammY router + capture conversation + /settings handler"
layer: "ports"
deps: ["T05", "T09"]
acs: ["AC-01", "AC-02", "AC-03", "AC-08", "AC-09", "AC-13"]
files_hint:
  - src/ports/router.ts
  - src/ports/conversations/capture-conversation.ts
  - src/ports/handlers/settings-handler.ts
  - src/ports/middleware/auth-middleware.ts
  - src/ports/dto/
  - src/ports/__tests__/capture-conversation.test.ts
  - src/ports/__tests__/settings-handler.test.ts
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T10 — grammY router + capture conversation + /settings handler

## Why

This task wires the incoming Telegram update stream (long-poll, [ADR-0003](../adr/0003-long-polling-intake.md)) to the capture use cases (T05). It is the reactive entry point for the Owner's capture flow and the `/settings` setup required before any reminder can be created.

## What

**`auth-middleware.ts`** — grammY middleware run on every update:
- Loads `ownerSettings` from the repo.
- If `ctx.from?.id !== ownerSettings.ownerTelegramId` → silently `return` without calling `next()` (AC-09 — no reply).

**`/settings` handler** (`settings-handler.ts`):
- Listens for `/settings` command.
- Prompts Owner for IANA timezone string.
- Validates input (if invalid → "Невідомий часовий пояс…" error reply per [contracts/cli.md §/settings](../contracts/cli.md)).
- Writes `owner_settings.timezone`; confirms "Timezone set: Europe/Kyiv".

**`capture-conversation.ts`** — grammY conversation (or state-machine handler):
- Triggered on every forwarded message (`message.forward_origin` present).
- If timezone not set → "Please run `/settings` first" prompt, stores capture for resume (AC-13; spec §8 OQ-3: prompt expires after 24h via `ExpireStalePrompts`).
- Calls `CaptureMessage` use case → reminderId.
- Sends "When to remind?" keyboard: In 1h / This evening 19:00 / Tomorrow morning 07:00 / In 1 week / Custom time (AC-01).
- On quick-pick tap (callback query within conversation) → resolves `ScheduledTime.fromQuickPick`; calls `ScheduleReminder` → confirms time in plain language (AC-02).
- On "Custom time" → asks Owner for text input; parses via `ScheduledTime.parse`; if past → re-prompts with error (AC-08); on valid input → confirms (AC-03).

**`router.ts`** — composes middleware + conversation + settings handler on a grammY `Bot` instance (injected).

## Definition of Done

- [ ] Auth middleware: non-Owner update silently discarded, Owner update passes through (AC-09 unit test)
- [ ] Capture conversation: forwarded message triggers "When to remind?" prompt with 5 buttons (AC-01)
- [ ] Quick-pick tap confirms scheduled time in plain language (AC-02)
- [ ] Custom time: valid future input schedules and confirms (AC-03); past input re-prompts with error (AC-08)
- [ ] Timezone-not-set: Owner redirected to `/settings` prompt, capture suspended (AC-13)
- [ ] `/settings` handler: valid IANA timezone accepted; invalid rejected with localized message
- [ ] lint + vet clean

## Notes

Derives from [spec §5 AC-01..03, AC-08, AC-09, AC-13](../spec.md), [sad §6 Flows 1, 3, 4](../sad.md), [contracts/cli.md](../contracts/cli.md). The anti-flood NFR (spec §6: ≤10 bot messages / 60s window) is enforced at the transport level by grammY's built-in rate-limit handling — no manual counter needed in this task. Files_hint overlaps with T11 in `src/ports/` — they are separate files; no serialization needed unless both tasks are scheduled to the same dev session.
