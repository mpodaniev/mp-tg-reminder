---
id: T1
title: "Add plain-text capture handler in capture-conversation.ts"
layer: "ports"
deps: []
acs: ["AC-01", "AC-01b", "AC-03"]
files_hint: ["src/ports/conversations/capture-conversation.ts", "src/ports/__tests__/capture-conversation.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T1 — Add plain-text capture handler in capture-conversation.ts

## Why

Derives from [spec §AC-01, AC-01b](../spec.md) and [sad §5/§6 Flow 1](../sad.md) — the new entry point is a sibling function next to `handleForwardedMessage` in the same file, reusing `CaptureMessage.execute` and `buildQuickPickKeyboard` verbatim, with the source snapshot set to the existing no-source-chat sentinel (`chatId: 0, messageId: 0, chatUsername: null, messageText: <typed text>`) documented in [data-model.md](../data-model.md).

## What

Add a new exported function (e.g. `handleTypedMessage`) in `src/ports/conversations/capture-conversation.ts`, modeled on `handleForwardedMessage`:

- builds the snapshot with the sentinel values (no `chatId`/`messageId`/`chatUsername` from the message — those are always the sentinel for a typed capture);
- calls `captureUC.execute({ senderTelegramId, snapshot })` (same use-case, unchanged);
- shows the "When to remind?" prompt via the existing `buildQuickPickKeyboard` helper, identically to the forwarded path.

No change to `CaptureMessage`, `ScheduleReminder`, or any other use-case — capture and downstream scheduling are source-agnostic already (sad §6 "Unchanged, not redrawn" note for AC-03).

## Definition of Done

- [ ] Unit test: typed text with no pending prompt captures a reminder and shows the quick-pick keyboard (AC-01).
- [ ] Unit test: two typed captures in a row (before either's prompt is answered) each produce an independent pending reminder — an unanswered quick-pick never blocks a new one (AC-01b).
- [ ] Integration test: after typed capture, picking a quick-pick option schedules the reminder identically to a forwarded-origin one (AC-03) — asserts the reminder reaches `pending` with a `scheduled_at` set, no source-specific branching.
- [ ] lint + vet clean (repo has no lint configured — vet/typecheck only, per `architecture-map.md`).

## Notes

Same file as `handleForwardedMessage` — no new file, no new export surface beyond the one new function. `router.ts` (T2) will import and call this function; T2 is blocked on this task landing first since it references the new export.
