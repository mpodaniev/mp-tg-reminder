---
id: T8
title: "Wire /list — register command, command-menu entry, callback routes + DI"
layer: "wiring"
deps: ["T6", "T7"]
acs: ["AC-05", "AC-07"]
files_hint: ["src/ports/router.ts", "src/main.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T8 — wire /list

## Why

Connects the handlers to the bot and exposes both entry points. Derives from [spec §AC-05/AC-07](../spec.md), [sad §5 router](../sad.md), [sad §6 flow 5 + cross-cutting](../sad.md).

## What

In `src/ports/router.ts`: register the `/list` command and add it to the Telegram command-menu, both behind the owner gate; wire the cancel/source callback routes to the T7 handlers. In `src/main.ts`: construct the list-handler with its use-case dependencies (manual constructor DI in the composition root). Both entry points (typed command, menu selection) must route to the same handler → identical response (AC-07).

## Definition of Done

- [ ] Router-auth test: the new `/list` route + callbacks are rejected for non-Owner (AC-05).
- [ ] Both entry points produce the same Active-list response (AC-07).
- [ ] App builds and starts; `/list` is reachable.
- [ ] lint + vet clean.

## Notes

Final task — depends on both ports tasks. No new authz boundary (reuse the owner gate).
