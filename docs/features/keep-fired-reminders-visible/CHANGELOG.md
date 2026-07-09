# Changelog — keep-fired-reminders-visible

## keep-fired-reminders-visible — fired reminders stay on the Active list until deleted

**What:** The `/list` command now shows every reminder the Owner hasn't explicitly deleted — both
still-scheduled and already-fired ones — each clearly flagged 🕒 заплановано / 🔔 спрацювало. A
reminder keeps the position it was captured in for its whole lifecycle (firing, delivery, snooze
never reorder it); only an explicit Delete removes it from view. The `✅ Done` action is retired
from the fired-reminder message — Delete is now the one and only resolving action, and a stale
`Done` tap on an older message (or a forged callback) degrades gracefully with a toast instead of
crashing or silently resolving anything.

**Why:** The Owner's mental model of the list is "everything I still need to deal with," but a
fired-and-unresolved reminder used to vanish from it the instant it fired — see
[spec](spec.md) §1. Ordering and truncation switch from soonest-fire-time to capture order
([ADR-0002](adr/0002-capture-order-list-position.md)) so old fired reminders can't bury newly
captured ones. The Done action is retired because its distinction from Delete was unclear in
practice ([ADR-0001](adr/0001-retire-done-action-with-graceful-stale-callback.md)).

**How to use:** Send `/list` as the Owner. Scheduled and fired-but-undeleted reminders both
appear, oldest-captured first; fired rows lose the Cancel button (nothing left to cancel) but keep
the Source link. Tap 🗑 Delete on a fired-reminder message to remove it from the list.

**Operational notes:**
- Migration: none — query-scope and application-layer change only, no schema/DDL touched
  (`data-model.md` §Migrations).
- Feature flag / config: none.
- Rollback: revert the merge commit; no data migration to unwind.

**Acceptance criteria delivered:** AC-01 (fired reminders included), AC-02 (scheduled/fired flag),
AC-03 (stable capture-order position), AC-04 (only Delete removes a fired reminder, including the
`firing`/stuck-retry window), AC-05 (no Cancel on fired rows), AC-06 (stale/forged `done` tap
degrades gracefully), AC-07 (owner-only gate unaffected), AC-08 (overflow still one message + `…
ще N` indicator).
