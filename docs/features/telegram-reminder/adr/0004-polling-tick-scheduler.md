---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-06-13"
feature_size: "M"
ticket: "telegram-reminder"
---

# 0004 — Fire reminders with a polling-tick scheduler over the store

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** Mykhailo Podaniev (Owner / Architect)

## Context

Reminders must fire within ±60 s of their scheduled time (spec §6) and recover across a restart with zero loss (spec §2 Goal 3). The mechanism that decides *when* to fire is the heart of the durability goal, and it spans the scheduler and the store.

## Decision drivers

- **Zero loss across restart** (spec §2 Goal 3) — no firing state may live only in memory.
- **Fire accuracy within ±60 s** (spec §6) — the mechanism must resolve due reminders well inside the window.
- **Simplicity** (spec §1) — fewer moving parts for a solo-maintained tool.

## Considered options

1. **Polling-tick, store as source of truth** — reminders live in SQLite; a periodic tick (~15 s) selects due rows (`scheduled_at <= now AND state = pending`) and fires them.
2. **Timer-per-reminder + reload on start** — one in-memory `setTimeout` per pending reminder, reconstructed from SQLite at startup.

## Decision outcome

**Chosen:** Option 1 — a polling tick with the store as the single source of truth. After a restart the scheduler simply resumes ticking; there is no in-memory timer state to lose or reconstruct, which makes Goal 3 a structural property rather than a recovery routine. A ~15 s tick is comfortably inside the ±60 s accuracy window, and the per-tick `SELECT` is negligible at single-user scale.

## Consequences

**Positive**
- Recovery is automatic — the store holds all state; restart = resume ticking (Goal 3).
- Simple, easy-to-test logic (a pure «select due, fire each» loop).
- Immune to `setTimeout` drift on long intervals (weeks) and to host sleep / clock adjustment.

**Negative**
- Firing accuracy is bounded by the tick interval (~15 s ≪ ±60 s — acceptable).
- A steady cadence of small queries (trivial cost for SQLite).

**Neutral**
- Tightening accuracy later means shortening the tick — a config change, not a redesign.

## Links

- Spec: [[../spec.md]] §2, §6
- SAD: [[../sad.md]] §4, §6
- Related ADR: [[0002-sqlite-embedded-store]], [[0005-at-least-once-delivery]]
