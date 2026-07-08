---
id: T8
title: "Integration test: oversized visible set sends exactly one message + overflow indicator"
layer: "tests"
deps: ["T3"]
acs: ["AC-08"]
files_hint: ["src/ports/__tests__/list-handler.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T8 — Integration test: oversized visible set sends exactly one message + overflow indicator

## Why

Derives from [spec §AC-08](../spec.md), [sad §6 flow 4](../sad.md), [sad §10 QG-4](../sad.md). This is the dedicated anti-flood-invariant test, restated against the new capture-order truncation (superseding `list-active-reminders`' soonest-firing rule).

## What

- Extend `src/ports/__tests__/list-handler.test.ts`: seed more visible reminders (scheduled + fired-and-undeleted) than the per-window message limit, drive the list command, assert exactly one bot message is sent, containing the earliest-added rows that fit plus an overflow indicator for the rest.

## Definition of Done

- [ ] integration test: send-count === 1 for an oversized visible set
- [ ] integration test: the message contains the earliest-added rows and an overflow indicator, not the soonest-firing ones
- [ ] lint + vet clean

## Notes

Serializes after T3 in the same test file (`list-handler.test.ts`), shared lane with T9.
