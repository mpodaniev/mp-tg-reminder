---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-07-09"
feature_size: "S"
ticket: "N/A — internally reported usage gap, no external tracker"
---

# 0001 — Retire the Done action with graceful stale-callback handling

- **Status:** Accepted
- **Date:** 2026-07-09
- **Deciders:** Mykhailo Podaniev (Owner + Architect)

## Context

The fired-reminder message currently offers both `✅ Done` and `🗑 Delete`, and the Owner finds
the distinction unclear in practice (spec §1 ¶4). Removing `Done` touches three modules at once —
the keyboard in `infra/telegram/grammy-telegram-gateway.ts`, the callback handling in
`ports/handlers/resolve-handler.ts` / `ports/router.ts`, and the `done` state + `fired → done`
transition left dormant in `domain/state-machine.ts` — and every fired-reminder message already
sent before rollout still carries a live `done:<id>` callback button that Telegram will happily
deliver. AC-06 requires that a stale tap neither crash the bot nor mark the reminder resolved.

## Decision drivers

- Spec US-05 / AC-06: exactly one resolving action (Delete); a stale Done tap must degrade
  gracefully, not crash or silently resolve.
- Spec §8 open question (resolved): the domain's `done` state stays in place but unreachable —
  no removal, no migration.
- Existing convention: `handleListCancel` already maps `InvalidStateTransitionError` /
  `ReminderNotFoundError` to one uniform "no longer active" reply (`list-handler.ts:114-126`) —
  reuse over inventing a second error-reply convention.

## Considered options

1. **Remove the button, catch `InvalidStateTransitionError` in the resolve path, reply with the
   existing uniform "no longer active" message** — no domain change beyond leaving `done` dormant.
2. **Repurpose the Done button to behave like Delete** (silently alias it) — keeps a two-button
   layout but makes the surviving button lie about what it does.
3. **Remove the domain `done` state and transition entirely**, rejected by spec §8 as unnecessary
   surgery for an implementation-only concern with no Owner-observable effect.

## Decision outcome

**Chosen:** Option 1. It satisfies AC-06 directly, reuses the error-handling convention already
proven for stale `cancel` taps, and keeps the change local to the callback path — no schema or
domain-shape change, no button that lies about its behavior.

## Consequences

**Positive**
- One resolving action end-to-end; matches the Owner's mental model (spec Goals).
- Reuses the existing uniform-error-reply pattern — no new UX convention to learn or test.
- No schema change, no data migration.

**Negative**
- The domain still carries a `done` state and a `fired → done` transition that no live code path
  can trigger after rollout — a small amount of permanent dead code (accepted debt, §11).

**Neutral**
- If a future feature wants a second resolving action, the domain state is already there to reuse;
  only the UI/callback wiring would need to come back.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
- Related ADR: [[0002-capture-order-list-position]]
