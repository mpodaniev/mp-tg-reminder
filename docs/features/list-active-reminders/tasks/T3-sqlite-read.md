---
id: T3
title: "Implement findActivePendingOrdered in SqliteReminderRepository (reuse idx_reminders_state_scheduled_at)"
layer: "infra"
deps: ["T2"]
acs: ["AC-01"]
files_hint: ["src/infra/db/sqlite-reminder-repository.ts", "src/infra/db/row-mappers.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T3 — SQLite read for the Active list

## Why

Concrete read behind the T2 port. Derives from [spec §AC-01](../spec.md), [spec §6 Accuracy](../spec.md), [sad §6 flow 1](../sad.md).

## What

Implement `findActivePendingOrdered` in `src/infra/db/sqlite-reminder-repository.ts`: query `state='pending' ORDER BY scheduled_at` (tie-broken by capture order, earliest first) using the **existing** `idx_reminders_state_scheduled_at` index. Map rows via `src/infra/db/row-mappers.ts`. **No schema change, no migration.**

## Definition of Done

- [ ] Integration test (fixed clock): returns only `pending`, ordered by fire time asc, tie-broken by capture order.
- [ ] Query uses the existing index (no new index/migration added).
- [ ] lint + vet clean.

## Notes

Hard rule: no migration (sad §4). p95 ≤ 1000 ms relies on this staying on the index.
