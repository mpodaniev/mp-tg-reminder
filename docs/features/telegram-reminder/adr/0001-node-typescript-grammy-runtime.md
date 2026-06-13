---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-06-13"
feature_size: "M"
ticket: "telegram-reminder"
---

# 0001 — Use Node.js + TypeScript + grammY for the bot runtime

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** Mykhailo Podaniev (Owner / Architect)

## Context

The project is greenfield (spec §1) — no language or framework is fixed yet. The bot must handle Telegram updates, run a scheduler that fires reminders, and persist state durably. A runtime stack must be chosen before any module is designed, and the choice touches every module.

## Decision drivers

- **Latency p95 ≤ 2 s on a callback tap** (spec §6) — all candidate stacks meet this; not a differentiator.
- **Durability across restart** (spec §2 Goal 3) — the stack must integrate cleanly with an embedded datastore.
- **Delivery speed + personal fit** (spec §1) — the Owner is the sole builder; comfort and ecosystem maturity outweigh raw performance.
- **Inline-keyboard + callback-query support** — first-class in all candidates; a hard requirement (US-04..08).

## Considered options

1. **Python 3.12 + aiogram 3.x** — most popular Telegram-bot stack; mature router/FSM; SQLite via stdlib.
2. **Node.js 22 + TypeScript + grammY** — modern type-safe framework with a conversations plugin; SQLite via better-sqlite3.
3. **Go 1.22 + telebot v3** — compiled single binary; goroutine-based scheduler; more boilerplate for dialog FSM.

## Decision outcome

**Chosen:** Option 2 — Node.js 22 + TypeScript + grammY. Static typing out of the box guards a Confidential-data tool against shape bugs (spec §6.1), grammY's conversations plugin models the «when to remind?» dialog cleanly, and the stack is the Owner's preferred build environment — satisfying the delivery-speed driver.

## Consequences

**Positive**
- Compile-time type safety across the domain model (reminder lifecycle states, callback payloads) without an extra tooling step.
- grammY conversations + inline-keyboard API map directly onto the capture-and-schedule flow (US-01..03) and the fired-reminder actions (US-04..08).
- better-sqlite3 is synchronous and fast, simplifying the at-least-once delivery logic (no async race inside a single fire).

**Negative**
- better-sqlite3 is a native module — it must be compiled on install and rebuilt on a Node major-version bump (a redeploy concern, not a runtime one).
- The scheduler has no batteries-included library equivalent to APScheduler; the firing tick is hand-written (see ADR for the scheduling model in §6).

**Neutral**
- Switching to another stack later means a full rewrite — acceptable for a single-user personal tool with no migration surface beyond the SQLite file.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §2
- Related ADR: [[0002-sqlite-embedded-store]] (datastore engine), [[0004-polling-tick-scheduler]] (firing model)
