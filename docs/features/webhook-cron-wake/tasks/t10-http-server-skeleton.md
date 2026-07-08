---
id: T10
title: "Build the node:http server skeleton with route dispatch (ADR-0002)"
layer: "ports"
deps: []
acs: ["AC-04"]
files_hint: ["src/ports/http/server.ts", "src/ports/http/__tests__/server.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T10 — Build the node:http server skeleton with route dispatch (ADR-0002)

## Why

[ADR-0002](../adr/0002-raw-http-for-inbound-endpoints.md) commits to Node's built-in `http` module (no framework dependency) for the bot's first two public inbound endpoints. [sad.md §5](../sad.md) places this new adapter-in module at `src/ports/http/`.

## What

`src/ports/http/server.ts`: a `node:http` server that routes `POST /webhook/telegram` and `POST /wake` to injected async handler functions (the handlers themselves are [T11](./t11-webhook-handler.md)/[T12](./t12-wake-handler.md), not built here), returns 404 for any other path/method, and reads the port from an env var. Keep the routing table minimal — two routes, no middleware chain, per ADR-0002's "two routes don't need routing machinery" rationale.

## Definition of Done

- [ ] A request to an unknown path returns 404 with no handler invoked
- [ ] A request to a known path with the wrong method (e.g. GET on `/wake`) returns 404 or 405 with no handler invoked
- [ ] `POST /webhook/telegram` and `POST /wake` each dispatch to their injected handler with the raw request/response
- [ ] lint + vet clean

## Notes

Depends on nothing — can start immediately in parallel with T1–T9. T11 and T12 depend on this skeleton existing.
