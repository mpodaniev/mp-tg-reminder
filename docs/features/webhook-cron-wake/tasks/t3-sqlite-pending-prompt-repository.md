---
id: T3
title: "Implement PendingPromptRepository against SQLite"
layer: "infra"
deps: ["T1", "T2"]
acs: ["AC-05"]
files_hint: ["src/infra/db/sqlite-pending-prompt-repository.ts", "src/infra/db/row-mappers.ts", "src/infra/db/__tests__/sqlite-pending-prompt-repository.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T3 — Implement PendingPromptRepository against SQLite

## Why

Implements the [T2](./t2-pending-prompt-port-interface.md) port against the [T1](./t1-promote-pending-prompt-migration.md) `pending_prompt` table, per the access patterns in [data-model.md](../data-model.md) and the "distinct from `ExpireStalePrompts`" note in [sad.md §5](../sad.md).

## What

A `SqlitePendingPromptRepository` class (alongside `SqliteReminderRepository`, `src/infra/db/sqlite-reminder-repository.ts`) implementing:
- `savePendingPrompt()` → `INSERT ... ON CONFLICT (id) DO UPDATE` on `id = 1`
- `findPendingPrompt()` → `SELECT * FROM pending_prompt WHERE id = 1`, mapped via a row-mapper in `row-mappers.ts`
- `clearPendingPrompt()` → `DELETE FROM pending_prompt WHERE id = 1`

Add the `aPendingPrompt(overrides?)` test fixture per data-model.md's Test fixtures section, co-located per the repo's Vitest convention.

## Definition of Done

- [ ] Integration tests against a tmpdir SQLite DB cover: save creates the row, save-over-existing upserts (replaces type/reminderId), find returns null when no row exists, clear deletes the row
- [ ] `aPendingPrompt(overrides?)` fixture exists and is used by the new tests
- [ ] lint + vet clean

## Notes

Follows the existing `sqlite-reminder-repository.test.ts` structure for its tmpdir-DB setup/teardown pattern.
