---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-06-15"
feature_size: "S"
ticket: "list-active-reminders"
---

# 0002 — Render the Active list as an immutable point-in-time snapshot

- **Status:** Accepted
- **Date:** 2026-06-15
- **Deciders:** Mykhailo Podaniev (Architect/Owner)

## Context

The Active list message carries per-reminder action buttons (cancel, go-to-source). Between render and tap, a reminder can change state (it fires, or the Owner cancels it). The design must decide whether the rendered list stays as sent or is kept live (sad.md §4/§6, spec AC-03/AC-04).

## Decision drivers

- AC-03 specifies the originally rendered list message is "left unchanged — a frozen point-in-time snapshot".
- AC-04 requires a stale tap to be a graceful no-op, not a crash or double-act.
- Simplicity for a single-Owner bot — avoid edit-message races and the Telegram message-edit window.

## Considered options

1. **Immutable snapshot** — the list message is never edited after send; cancel/source produce separate reply messages; a tap on a since-changed entry returns a uniform "no longer active" no-op.
2. **Live-edit the list message** — after a cancel, edit the original list message to drop the row, keeping it current.

## Decision outcome

**Chosen:** Option 1 (immutable snapshot). It matches AC-03 directly, keeps each action a self-contained separate message, and sidesteps message-edit races and the edit window. Correctness of a stale tap is enforced by the domain transition guard (ADR-0001), which rejects any non-`pending` source state.

## Consequences

**Positive**
- No edit-window or concurrent-edit failure modes; the handler logic is a straight-line read + per-action reply.
- Stale taps are inherently safe — the domain guard is the single source of truth.

**Negative**
- A rendered list can show a reminder that has since fired or been cancelled; the Owner only learns on tap (the uniform no-op).

**Neutral**
- Live refresh / reschedule-from-list can be added later as a separate feature without reworking this contract (spec §8 open question).

## Links

- Spec: [[../spec.md]] AC-03, AC-04
- SAD: [[../sad.md]] §4, §6
- Related ADR: [[0001-reuse-deleted-state-for-cancel]]

## Update — 2026-07-12

Partially superseded by `docs/superpowers/specs/2026-07-12-list-live-refresh-design.md`
(GitHub issue #8): the Owner's own Cancel/Delete tap on a `/list` message now
edits that same message in place to drop the row — the "Live-edit" option
this ADR considered and deferred (see Consequences, Neutral). The core
decision still holds for every other case: a `/list` message is never edited
for reasons other than the Owner's own action on it (e.g. another reminder
firing in the background never pushes a live update to an open list).
