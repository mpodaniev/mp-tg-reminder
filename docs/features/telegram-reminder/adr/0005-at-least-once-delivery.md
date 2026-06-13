---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-06-13"
feature_size: "M"
ticket: "telegram-reminder"
---

# 0005 — Deliver fired reminders at-least-once with a confirmation flag

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** Mykhailo Podaniev (Owner / Architect)

## Context

A reminder whose send was not confirmed (the service crashed mid-fire, before Telegram acknowledged delivery) must be re-fired after restart so it is never silently lost (spec §6.1, §2 Goal 3). This decision fixes the reminder state machine and the store schema, both read across modules.

## Decision drivers

- **No reminder silently lost** (spec §2 Goal 3) — «no silent loss» outranks «no duplicate» (spec §6.1).
- **Suppress true duplicates** — a confirmed delivery must never be re-sent (spec §6.1).
- **Crash-consistency** with the SQLite store (ADR-0002) and the polling tick (ADR-0004).

## Considered options

1. **At-least-once with a confirmation flag** — mark `firing` → send → on Telegram ack, mark `fired` + `delivered_at`; a row stuck in `firing` after restart is re-fired.
2. **At-most-once (fire-and-forget)** — mark `fired` before sending; never re-fire.

## Decision outcome

**Chosen:** Option 1 — at-least-once with a `delivered_at` confirmation. The fire path transitions the row to an intermediate `firing` state, sends via Telegram, and only on acknowledgement records `fired` + `delivered_at`. On restart the tick picks up any row left in `firing` (crash between send and confirmation) and re-fires it; confirmed rows are never re-sent. At-most-once is rejected because a crash between «mark fired» and the actual send loses the reminder silently — a direct violation of Goal 3.

## Consequences

**Positive**
- No reminder is silently lost, even on a mid-fire crash (Goal 3).
- Confirmed deliveries are never duplicated (the `delivered_at` guard).

**Negative**
- A rare genuine duplicate is possible if the crash lands exactly between Telegram delivering and the bot writing `delivered_at` — explicitly accepted by spec §6.1.
- The state machine carries an extra transient `firing` state (more states to test).

**Neutral**
- The duplicate window can be narrowed later (e.g. an idempotency check on Telegram message id) without changing the model.

## Links

- Spec: [[../spec.md]] §2, §6.1
- SAD: [[../sad.md]] §4, §6, §8
- Related ADR: [[0002-sqlite-embedded-store]], [[0004-polling-tick-scheduler]]
