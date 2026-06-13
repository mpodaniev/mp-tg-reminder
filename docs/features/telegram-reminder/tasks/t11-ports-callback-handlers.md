---
id: T11
title: "Callback handlers: Snooze, Done, Delete, Go-to-source"
layer: "ports"
deps: ["T07", "T09"]
acs: ["AC-05", "AC-06", "AC-07", "AC-10", "AC-11", "AC-12"]
files_hint:
  - src/ports/handlers/snooze-handler.ts
  - src/ports/handlers/resolve-handler.ts
  - src/ports/handlers/source-handler.ts
  - src/ports/__tests__/snooze-handler.test.ts
  - src/ports/__tests__/resolve-handler.test.ts
  - src/ports/__tests__/source-handler.test.ts
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T11 — Callback handlers: Snooze, Done, Delete, Go-to-source

## Why

These handlers process the inline-button callback queries on fired-reminder messages. They are the Owner-facing resolution surface for all actions on a fired reminder ([sad §6 Flows 6, 7, 8](../sad.md)).

## What

Callback data format (set by T09): `snooze:<reminderId>`, `done:<reminderId>`, `delete:<reminderId>`, `source:<reminderId>`.

**`snooze-handler.ts`** — `snooze:<id>`:
1. Parse reminderId; `gateway.answerCallback(callbackQueryId)`.
2. Show snooze time-picker keyboard — only quick-picks whose wall-clock time is still in the future (AC-05); plus "Custom time".
3. On pick → `SnoozeReminder` use case; `gateway.editMessage(chatId, firedMessageId, "Rescheduled for …", updatedKeyboard)` to reflect new state (AC-05).
4. If `AlreadyResolvedError` → `gateway.answerCallback(…, "Reminder already resolved")` (AC-10).

**`resolve-handler.ts`** — `done:<id>` and `delete:<id>`:
1. `ResolveReminder` use case → `firedMessageId`.
2. Try `gateway.deleteMessage(chatId, firedMessageId)`.
3. On `MessageDeleteWindowExpiredError` → `gateway.editMessage(chatId, firedMessageId, "<resolved>", emptyKeyboard)` (AC-06/07 fallback — cleared-inbox invariant preserved visually).

**`source-handler.ts`** — `source:<id>`:
1. Load `snapshot` via `repo.findWithSnapshot(reminderId)`.
2. If `snapshot.hasDeepLink()` → `gateway.sendPrompt(chatId, deepLinkUrl)` (AC-11 happy path).
3. Else → `gateway.sendPrompt(chatId, "Direct link unavailable. Content: …" + captured text)` (AC-11 fallback).

AC-12 (protected-content note) is handled at fire time (T06) — no additional action needed here.

## Definition of Done

- [ ] Snooze handler: future quick-picks shown; past-today picks hidden (AC-05 unit test)
- [ ] Snooze on already-resolved reminder: callback answered with "Reminder already resolved" — no state change (AC-10)
- [ ] Done handler: `deleteMessage` called; on `MessageDeleteWindowExpiredError` → `editMessage` fallback (AC-06)
- [ ] Delete handler: same delete-or-edit-fallback pattern (AC-07)
- [ ] Go-to-source: deep link sent when `hasDeepLink()=true`; fallback text sent when false (AC-11)
- [ ] lint + vet clean

## Notes

Derives from [spec §5 AC-05..07, AC-10, AC-11](../spec.md) and [sad §6 Flows 6, 7, 8](../sad.md). The `MessageDeleteWindowExpiredError` type is defined in T09 (gateway). `files_hint` overlaps with T10 in `src/ports/` — separate files, no serialization needed unless same dev session.
