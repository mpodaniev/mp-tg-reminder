---
id: T9
title: "Extend owner-gate test: non-Owner sees nothing when fired reminders exist"
layer: "tests"
deps: ["T3"]
acs: ["AC-07"]
files_hint: ["src/ports/__tests__/router-auth.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T9 — Extend owner-gate test: non-Owner sees nothing when fired reminders exist

## Why

Derives from [spec §AC-07](../spec.md), [sad §6 flow 3](../sad.md). This is the dedicated authorization test: a non-Owner must see no reminders of any kind — scheduled or fired — consistent with the bot's owner-only access rule, now that fired reminders are part of the visible set.

## What

- Extend the existing owner-gate test in `src/ports/__tests__/router-auth.test.ts`: seed at least one `fired`-and-undeleted reminder alongside a `pending` one, send the list command as a non-Owner, assert the reply reveals no reminder of either kind.

## Definition of Done

- [ ] unit test: non-Owner list command with a fired reminder present still reveals nothing
- [ ] lint + vet clean

## Notes

Reuses the existing gate test's fixture setup — extend it rather than duplicating a new test file. Serializes after T3 lands (list-handler's fired-row rendering must exist for the fixture to be meaningful), but touches a different file (`router-auth.test.ts`) than T8, so it can run in parallel with T8.
