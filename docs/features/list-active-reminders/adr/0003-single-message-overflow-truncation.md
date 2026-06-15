---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-06-15"
feature_size: "S"
ticket: "list-active-reminders"
---

# 0003 — Truncate the Active list to one message with an overflow indicator

- **Status:** Accepted
- **Date:** 2026-06-15
- **Deciders:** Mykhailo Podaniev (Architect/Owner)

## Context

The list must answer in exactly one bot message and stay within the anti-flood budget, but the Active set is unbounded and a single Telegram message is capped at 4096 characters. The design must decide what happens when the Active set does not fit one message (sad.md §4/§6/§8, spec AC-08, §6 NFR).

## Decision drivers

- spec §6 NFR: "exactly 1 bot message regardless of reminder count" and anti-flood ≤ 10 msgs / 60 s (list contributes ≤ 1).
- AC-08 names the invariant: a single list invocation never exceeds the anti-flood message budget.
- Single-Owner personal bot — Active sets large enough to overflow are rare.

## Considered options

1. **Truncate + overflow indicator** — list the soonest-firing reminders that fit, then append "… ще M" (the count not shown). "Fit" = `min(fixed max-count, Telegram 4096-char limit)`.
2. **Pagination** — show a page with a "next" button and keep page state, sending further pages on demand.

## Decision outcome

**Chosen:** Option 1 (truncate + indicator). It satisfies the exactly-one-message and anti-flood invariants by construction, needs no page state, and matches AC-08 verbatim. Pagination is an explicit spec Non-goal. The soonest-firing reminders are the most actionable, so truncating the tail loses the least value.

## Consequences

**Positive**
- The one-message / anti-flood invariant holds by construction; no page-state bookkeeping.
- Always surfaces the most time-critical (soonest-firing) reminders.

**Negative**
- Far-future reminders beyond the cut are not actionable from the list until earlier ones clear.

**Neutral**
- Pagination can be added later if Active sets routinely overflow, without changing the truncation default.

## Links

- Spec: [[../spec.md]] AC-08, §6 NFR
- SAD: [[../sad.md]] §4, §8
- Related ADR: [[0002-immutable-snapshot-list]]
