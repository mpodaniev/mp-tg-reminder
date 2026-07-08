---
id: T1
title: "Widen repository query scope to pending+fired, ordered by capture order"
layer: "infra"
deps: []
acs: ["AC-01", "AC-08"]
files_hint: ["src/app/ports/reminder-repository.ts", "src/infra/db/sqlite-reminder-repository.ts", "src/infra/__tests__/sqlite-reminder-repository.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T1 — Widen repository query scope to pending+fired, ordered by capture order

## Why

Derives from [spec §AC-01/AC-08](../spec.md), [sad §5 point 1](../sad.md), [ADR-0002](../adr/0002-capture-order-list-position.md). The list must include `fired`-but-undeleted reminders, ordered by capture time rather than fire time.

## What

- `src/app/ports/reminder-repository.ts` — widen the method signature's scope to cover `pending` + `fired`, ordered by `id ASC`.
- `src/infra/db/sqlite-reminder-repository.ts` — change the query to `WHERE state IN ('pending','fired') ORDER BY id ASC` (no new index needed — `id` is the SQLite rowid alias, per `data-model.md` Indexes).
- No schema/migration change (`data-model.md` confirms none staged).

## Definition of Done

- [ ] integration test against real SQLite asserts both `pending` and `fired` rows are returned, ordered by `id ASC`
- [ ] lint + vet clean

## Notes

No new index — `data-model.md` already evaluated and rejected one; a full-table scan is acceptable at this bot's scale.
