---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-06-15"
feature_size: "S"
ticket: "list-active-reminders"
---

# 0001 — Reuse the `deleted` terminal state for cancelling a pending reminder

- **Status:** Accepted
- **Date:** 2026-06-15
- **Deciders:** Mykhailo Podaniev (Architect/Owner)

## Context

The Active list adds a cancel action that removes a reminder before it fires. The telegram-reminder spec (Edit #8) had restricted deletion to `fired` reminders only, on the premise that no UI surfaced pending reminders. This feature adds exactly that surface, so it reopens the decision and needs a lifecycle transition out of `pending` for a user-initiated cancel (sad.md §4, spec §1 ¶4).

## Decision drivers

- The existing lifecycle already has `deleted` as a terminal state — reuse avoids a new state and schema change.
- Single-Owner personal bot — no audit/reporting requirement that needs cancel distinguished from post-fire deletion.
- "No schema change" goal for this S-sized increment (the read path also reuses the existing index).

## Considered options

1. **Reuse `deleted`** — add a `pending` → `deleted` transition; the existing terminal state and schema are unchanged.
2. **New `cancelled` state** — add a distinct terminal state to separate "cancelled before fire" from "deleted after fire", at the cost of a new state plus an enum/CHECK migration.

## Decision outcome

**Chosen:** Option 1 (reuse `deleted`). The two outcomes — cancelled-before-fire and deleted-after-fire — are both "the Owner removed it"; a single-Owner bot has no consumer that needs them distinguished. Reuse keeps the state machine small and requires no migration.

## Consequences

**Positive**
- No new state, no schema/migration change; the smallest possible lifecycle delta.
- The cancel mutation reuses the existing owner gate and persistence path.

**Negative**
- The lifecycle cannot, by itself, tell a cancelled-before-fire reminder apart from one deleted after firing.

**Neutral**
- If a future feature needs that distinction, introducing a `cancelled` state later is an additive migration (no backfill of meaning required for already-`deleted` rows beyond accepting they are ambiguous).

## Links

- Spec: [[../spec.md]] §1 ¶4, AC-03
- SAD: [[../sad.md]] §4
- Related ADR: [[0002-immutable-snapshot-list]]
