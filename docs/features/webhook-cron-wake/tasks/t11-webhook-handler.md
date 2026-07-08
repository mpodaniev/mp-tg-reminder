---
id: T11
title: "Implement the Telegram webhook handler (secretToken verification)"
layer: "ports"
deps: ["T7", "T10"]
acs: ["AC-02", "AC-04", "AC-04b"]
files_hint: ["src/ports/http/webhook-handler.ts", "src/ports/http/__tests__/webhook-handler.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T11 — Implement the Telegram webhook handler (secretToken verification)

## Why

Per [contracts/openapi.yaml](../contracts/openapi.yaml)'s `/webhook/telegram` operation and [sad.md §6 Critical flow 2](../sad.md): verify grammy's `X-Telegram-Bot-Api-Secret-Token` header, then forward the verified update to the [T7](./t7-centralize-owner-auth-gate.md)-gated router. Only a missing/invalid secret token is rejected here — the Owner-authorization outcome (AC-04b) is not HTTP-visible by design (the contract always returns 200 once the token verifies).

## What

`src/ports/http/webhook-handler.ts`: reads and verifies `X-Telegram-Bot-Api-Secret-Token` against the configured secret; on mismatch, responds 401 with the `webhook.invalid_secret_token` error code from the contract and takes no other action (AC-04). On match, parses the JSON body as a Telegram `Update`, forwards it into `router.handleUpdate()`, and always responds 200 with the empty `Ack` body — regardless of whether the router's internal Owner-gate accepted or silently no-opped (AC-04b).

## Definition of Done

- [ ] A request with a missing/invalid secret token gets 401 with the contract's error shape, and `router.handleUpdate` is never called
- [ ] A request with a valid secret token and an Owner-sender update gets 200 and the update reaches the matching handler
- [ ] A request with a valid secret token and a non-Owner-sender update also gets 200, but no handler side effect occurs (AC-04b, verified via a spy/mock repo)
- [ ] Response bodies match `contracts/openapi.yaml`'s `Ack`/`Error` schemas
- [ ] lint + vet clean

## Notes

Depends on T7 (the router must already gate non-Owner senders) and T10 (the server skeleton it plugs into).
