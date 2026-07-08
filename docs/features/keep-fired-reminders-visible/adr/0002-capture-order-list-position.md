---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-07-09"
feature_size: "S"
ticket: "N/A — internally reported usage gap, no external tracker"
---

# 0002 — Use the monotonic reminder id as the sole list ordering and truncation key

- **Status:** Accepted
- **Date:** 2026-07-09
- **Deciders:** Mykhailo Podaniev (Owner + Architect)

## Context

`list-active-reminders` orders the list by `scheduled_at ASC` (soonest-firing first) and truncates
by keeping the soonest-firing rows that fit. Once fired reminders stay listed indefinitely (this
feature), sorting by fire time would bury newly captured reminders under old fired ones — spec §1
¶4 overrides both the ordering and the truncation rule to be capture-order based instead
(AC-03/AC-08). This SAD decision is *how* "capture order" is realized: reuse the existing
autoincrement `id` (already assigned at capture time, already unique, already indexed via the
primary key) versus adding a new explicit sequence/position column.

## Decision drivers

- Spec AC-03: a reminder's list position must never change as it moves through
  pending → firing → fired (or is snoozed) — the key must be assigned once, at capture, and never
  recomputed.
- Spec AC-08: truncation must keep "the earliest-added that fit", using the same key as ordering.
- `docs/architecture-map.md` constraint: `id INTEGER PRIMARY KEY AUTOINCREMENT`, already the
  capture-order proxy in the existing schema (migrations/03_create_reminders.up.sql:10).
- Effort budget (size S): avoid a schema change / migration where an existing column already
  satisfies the invariant.

## Considered options

1. **Reuse the existing autoincrement `id` as the sort/truncation key** — no schema change, no
   migration; `id` is already monotonic with capture time and never mutates after insert.
2. **Add a new explicit `position`/`sequence` column**, populated at capture — gives an
   independent, renumber-able ordering key, at the cost of a new migration and a column that
   duplicates what `id` already guarantees for this bot's insert pattern (no bulk-import, no
   id-reuse).

## Decision outcome

**Chosen:** Option 1. The bot never reuses or renumbers ids and never bulk-imports reminders out of
capture order, so `id ASC` already satisfies AC-03/AC-08 exactly. Option 2 would add a migration
and a maintained column purely to re-derive an ordering the primary key already gives for free.

## Consequences

**Positive**
- No schema change, no migration — `data-model` for this feature can be a no-op or a thin
  reconciliation note.
- The invariant (position fixed at capture, never recomputed) holds structurally: `id` cannot
  change after insert.

**Negative**
- Ties the list's visible order to an internal database implementation detail (autoincrement
  identity) rather than a domain-owned field — acceptable here because the bot's insert pattern
  guarantees `id` order == capture order, but would need revisiting if that pattern ever changes
  (e.g. bulk import, id migration).

**Neutral**
- If a future feature needs Owner-controlled reordering (drag-to-reorder, pinning), an explicit
  `position` column would need to be introduced then — this decision does not preclude it, just
  defers it until there's a real need (no such need exists today per spec Non-goals).

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
- Related ADR: [[0001-retire-done-action-with-graceful-stale-callback]]
