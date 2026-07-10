---
slug: keep-fired-reminders-visible
date: 2026-07-10
triage: gap
acs: [AC-09]
commit: 4741dbb
recurrence_of: none
---

# Fix: fired rows in /list offer no way to delete the reminder

## Symptom

Using `/list`, when the only remaining visible reminder had already fired
(🔔 спрацювало), the Owner expected a way to remove it from the list but only
saw a "🔗 Джерело" button — no "🗑 Скасувати"/delete action was offered, so
the entry could not be cleared from `/list` itself. Affects the Owner (the
bot's only user) any time a fired-but-undeleted reminder is the one they want
gone; not new-since-a-release — present since `keep-fired-reminders-visible`
shipped.

## Root cause

`renderListMessage()` (`src/ports/handlers/list-handler.ts:39-74`) only ever
attaches a row action for the `scheduled` status (Cancel); a `fired` row gets
only the Source button. This matched `docs/features/keep-fired-reminders-visible/spec.md`
§3's original non-goal ("deletion continues to happen from the
fired-reminder message in chat"), which assumed the Owner would always
resolve a fired reminder from that original chat message. In practice the
Owner wants to clear it from `/list` directly too — no AC covered this, so it
is a **gap**, not a regression against existing wording.

## The pinning test

`marks fired rows with a distinct flag and omits Cancel; scheduled rows keep Cancel (AC-02/AC-05)`
(unit) — `src/ports/__tests__/list-handler.test.ts:151`. First run (RED):

```
AssertionError: expected false to be true // Object.is equality
 ❯ src/ports/__tests__/list-handler.test.ts:151:71
```

failing on `expect(keyboard.some((b) => b.callback_data === "delete:2")).toBe(true)` —
a GOOD red: it fails on the assertion encoding the expected new behavior, not
on an unrelated error.

## Spec patch

**(c) gap** — new AC added to `docs/features/keep-fired-reminders-visible/spec.md` §5:

```md
### AC-09 (US-04) — happy path <!-- added-by-fix: 2026-07-10 -->

**Given** an authorized Owner is viewing the list where an entry has already fired but not been deleted
**When** the Owner taps that entry's Delete action from the list, instead of the fired-reminder message in chat
**Then** the reminder is deleted the same way it would be from that message's Delete button — the Owner is never required to locate the original fired message just to clear the list
```

The §3 non-goal "Adding a delete action to the list itself" is struck through
and marked superseded by AC-09, and ¶4's decision-override list gained a
matching entry, so the spec no longer contradicts itself.

## Follow-ups

- None — the fix reuses the existing `delete:<id>` callback path
  (`src/ports/router.ts` → `handleResolve` → `ResolveReminder`) verbatim; no
  new use-case logic was needed.
