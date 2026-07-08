---
id: T12
title: "Implement the wake handler (constant-time bearer token verification)"
layer: "ports"
deps: ["T4", "T10"]
acs: ["AC-01", "AC-01b", "AC-04"]
files_hint: ["src/ports/http/wake-handler.ts", "src/ports/http/__tests__/wake-handler.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T12 — Implement the wake handler (constant-time bearer token verification)

## Why

Per [contracts/openapi.yaml](../contracts/openapi.yaml)'s `/wake` operation and [sad.md §6 Critical flow 1](../sad.md): a static bearer token (env var), verified in constant time, gates the endpoint that invokes [T4](./t4-scheduler-public-tick-drain.md)'s `Scheduler.tick()`. The 200 response is only sent once `tick()` fully resolves, per AC-01b.

## What

`src/ports/http/wake-handler.ts`: reads the `Authorization: Bearer <token>` header and compares it against the configured token using a constant-time comparison (e.g. `crypto.timingSafeEqual` on equal-length buffers, rejecting immediately on length mismatch without a variable-time compare). On mismatch, responds 401 with the `wake.invalid_token` error code and `scheduler.tick()` is never called (AC-04). On match, `await`s `scheduler.tick()` before responding 200 with the empty `Ack` body (AC-01b).

## Definition of Done

- [ ] A request with a missing/invalid bearer token gets 401 with the contract's error shape, and `tick()` is never invoked
- [ ] A request with a valid token invokes `tick()` and the response is sent only after it resolves (verified with a deferred/delayed fake `tick()` in the test)
- [ ] Token comparison uses a constant-time method, not `===`/string comparison
- [ ] Response bodies match `contracts/openapi.yaml`'s `Ack`/`Error` schemas
- [ ] lint + vet clean

## Notes

Depends on T4 (the public `tick()`) and T10 (the server skeleton). Runs in parallel with T11 — they touch different files.
