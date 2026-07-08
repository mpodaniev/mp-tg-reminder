---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: []
updated_at: "2026-07-02"
feature_size: "M"
ticket: "webhook-cron-wake"
---

# 0003 — Centralize Owner authorization in a single router-level gate

- **Status:** Accepted
- **Date:** 2026-07-02
- **Deciders:** Mykhailo Podaniev (Architect), no live response during the Socratic walk — Recommended default applied per Auto Mode, flagged for review.

## Context

Today only the `callback_query` handler checks the sender is the Owner (`src/ports/router.ts:62-66`); message-based handlers (`/settings`, `/list`, forwarded messages, and critically the custom-time text-input path at `src/ports/router.ts:56-59`) do not perform this check at the router level — the custom-time path only checks that `pendingCustom` has an entry for the sender, not that the sender is the Owner. Spec AC-04b requires every handler that touches the Owner's reminders or settings to deny non-Owner senders, not only callback-based ones. A decision is needed on where that check lives.

## Decision drivers

- Spec AC-04b: "the system denies the action on every handler that touches the Owner's reminders or settings — not only callback-based ones as today."
- Spec §6.1: introducing new inbound trust boundaries (the webhook) raises the cost of an inconsistent authorization pattern — a new handler added later could silently reintroduce the gap.
- A nascent `isOwner()` helper already exists (`src/ports/middleware/auth-middleware.ts:3-10`), currently called ad hoc inside `list-handler.ts` — the codebase already has the primitive, just not a uniform place it's invoked from.

## Considered options

1. **Single gate at router dispatch** — one `isOwner()` check in `buildRouter`, before any handler runs, so a new handler is authorized by construction.
2. **Per-handler checks** — add `isOwner()` calls to the specific handlers currently missing it (custom-time text input), leaving the existing per-handler pattern (as in `list-handler.ts`) for the rest.

## Decision outcome

**Chosen:** Option 1, a single router-level gate. This is the only option that prevents the same class of gap from recurring when a new handler is added later — the exact failure mode that produced today's inconsistency (`callback_query` protected, message handlers not).

## Consequences

**Positive**
- A new handler is Owner-gated by construction — no handler author needs to remember to call `isOwner()`.
- Closes AC-04b's gap at its root (the custom-time text-input path) rather than patching that one path only.

**Negative**
- Touches `src/ports/router.ts` and removes/relocates the existing per-handler `isOwner()` calls (e.g. in `list-handler.ts`) to avoid a redundant double-check — a small refactor across several handler files.

**Neutral**
- The existing `auth-middleware.ts` helper is reused as-is; only its call site moves.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
- Related ADR: none
