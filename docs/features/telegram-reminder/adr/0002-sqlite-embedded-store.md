---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-06-13"
feature_size: "M"
ticket: "telegram-reminder"
---

# 0002 — Use an embedded single-file SQLite store

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** Mykhailo Podaniev (Owner / Architect)

## Context

Reminders and their scheduled times must survive a service restart with zero loss (spec §2 Goal 3 — the dominant quality goal). A persistence engine must be chosen before the data model is designed, and it is read and written by every module (capture, scheduler, fire, resolve).

## Decision drivers

- **Zero pending reminders silently lost across restart** (spec §2 Goal 3, §6 Durability).
- **Single-user, single-host tool** (spec §3) — no horizontal scale, no concurrent-writer contention.
- **Delivery speed + minimal ops** (spec §1) — every added moving part (a DB server) works against the priority.

## Considered options

1. **Embedded SQLite, one file (`better-sqlite3`)** — state in a single on-disk file; WAL + synchronous writes for durability; no external server.
2. **PostgreSQL (separate server)** — a standalone DB process/container.

## Decision outcome

**Chosen:** Option 1 — embedded SQLite via `better-sqlite3` in WAL mode with `synchronous=FULL` (or `NORMAL` in WAL, which is crash-safe). For a single-user bot, SQLite gives the durability guarantee with zero infrastructure: a backup is a file copy, and there is no separate process to deploy or monitor. PostgreSQL's concurrency and scale strengths are irrelevant to one user and add ops overhead that contradicts the delivery-speed driver.

## Consequences

**Positive**
- Goal 3 met with WAL journalling (writes hit a write-ahead log that survives a crash) + fsync on commit.
- Zero external infrastructure; the entire database is one file alongside the binary.
- `better-sqlite3` is synchronous → no async race inside a single fire transaction (simplifies ADR-0005's confirmation write).

**Negative**
- Single-host only — no horizontal scaling (a non-goal for a personal tool, spec §3).
- A native module that must be compiled on install / rebuilt on a Node major bump (ADR-0001).

**Neutral**
- Migrating to a client-server DB later is possible but means an export/import — acceptable given there is one user and one file.

## Links

- Spec: [[../spec.md]] §2, §6
- SAD: [[../sad.md]] §4
- Related ADR: [[0001-node-typescript-grammy-runtime]], [[0004-polling-tick-scheduler]], [[0005-at-least-once-delivery]]
