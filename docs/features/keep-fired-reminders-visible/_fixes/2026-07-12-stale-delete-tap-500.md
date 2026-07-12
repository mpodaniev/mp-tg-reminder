---
slug: keep-fired-reminders-visible
date: 2026-07-12
triage: gap
acs: [AC-10]
commit: <filled after commit>
recurrence_of: none
---

# Fix: stale `delete` callback on a non-fired reminder returns HTTP 500

## Symptom

Tapping the fired-notification's own Delete button (`callback_data: delete:ID`)
for a reminder that is no longer in the `fired` state (already deleted, or —
after issue #8's callback split — a pre-deploy `/list` message still carrying
the old `delete:ID` tag on a fired row) throws an unhandled
`InvalidStateTransitionError`/`ReminderNotFoundError` out of `handleResolve`,
which propagates to `webhook-handler.ts`'s unwrapped
`await router.handleUpdate(update)` and surfaces as **HTTP 500** to Telegram's
webhook delivery.

Reproduced live during PR #11's manual verification (real HTTP server, real
SQLite, stubbed Telegram API leg): `delete:3` on a `pending` reminder →
`HTTP 500`, app log `InvalidStateTransitionError: Cannot apply event
'resolve_delete' to reminder in state 'pending'`. Affects every Owner
interaction (single-Owner bot), any time this stale tap occurs — not new to
PR #11, pre-existing since the Delete action was introduced
(`keep-fired-reminders-visible`, ADR-0001).

## Root cause

`ResolveReminder.execute()` (`src/app/use-cases/resolve-reminder.ts`) only
special-cases `action === "done"` as an always-rejected, gracefully-caught
retired action (ADR-0001). For `action === "delete"`, the domain's real
`resolve_delete` transition guard (`state-machine.ts`, valid only from
`fired`) is left to throw straight through `handleResolve`
(`src/ports/handlers/resolve-handler.ts:44-56`, pre-fix), which had no catch
branch for `delete` — only `done` was guarded. No test exercised a `delete`
tap from a non-`fired` state, so the gap was invisible until a live
reproduction surfaced it.

## The pinning test

`src/ports/__tests__/resolve-handler.test.ts` — two new unit tests:
- `guards a stale delete tap: no crash, no cleanup, uniform toast, no state change (issue #12)`
- `a stale delete tap on a non-existent/forged reminderId degrades gracefully, no unhandled throw (issue #12)`

RED (before fix), first test:
```
AssertionError: promise rejected "InvalidStateTransitionError: Cannot apply…" instead of resolving
Caused by: InvalidStateTransitionError: Cannot apply event 'resolve_delete' to reminder in state 'pending'
 ❯ handleResolve src/ports/handlers/resolve-handler.ts:46:16
```

## Spec patch

(c) gap — new `AC-10 (US-05)` added to
`docs/features/keep-fired-reminders-visible/spec.md` §5, marked
`<!-- added-by-fix: 2026-07-12 -->`, plus a matching row in the AC→test
coverage table. User-confirmed before applying.

## Follow-ups

- None. The fix is a one-line widening of the existing `done` guard's catch
  condition to also cover `delete`, reusing the same `answerCallbackQuery`
  toast mechanism — no refactor exposed beyond this.
