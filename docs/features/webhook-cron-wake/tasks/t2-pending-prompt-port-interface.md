---
id: T2
title: "Add the PendingPromptRepository port interface"
layer: "app"
deps: []
acs: ["AC-05"]
files_hint: ["src/app/ports/pending-prompt-repository.ts", "src/app/ports/index.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T2 — Add the PendingPromptRepository port interface

## Why

[sad.md §5 decision 2](../sad.md) introduces `PendingPromptRepository` as a new app-layer port with `savePendingPrompt()` / `findPendingPrompt()` / `clearPendingPrompt()`, mirroring the existing `ReminderRepository` pattern (`src/app/ports/reminder-repository.ts`).

## What

Define the `PendingPromptRepository` interface and its row/DTO shape (`type: "capture" | "snooze"`, `reminderId`, `createdAt`), matching [data-model.md](../data-model.md)'s `pending_prompt` columns. Export it from `src/app/ports/index.ts` alongside the existing port exports. No implementation — this is the interface only, so it can proceed in parallel with T1's migration.

## Definition of Done

- [ ] `PendingPromptRepository` interface compiles and is exported
- [ ] Method signatures match the access patterns in data-model.md (`findPendingPrompt()`, `savePendingPrompt()` as upsert, `clearPendingPrompt()` as delete)
- [ ] lint + vet clean

## Notes

Keep this a pure interface addition — no SQLite import, no DB dependency. T3 implements it once T1's migration exists.
