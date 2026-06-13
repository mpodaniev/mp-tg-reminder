---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-06-13"
feature_size: "M"
ticket: "telegram-reminder"
---

# 0003 — Use long-polling (getUpdates) for Telegram intake

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** Mykhailo Podaniev (Owner / Architect)

## Context

The bot must receive forwarded messages and inline-button taps from Telegram (spec US-01..08). Telegram offers two intake models — long-polling (`getUpdates`) and webhook — and the choice fixes the whole ingress and deployment shape before §5/§7 are designed.

## Decision drivers

- **Delivery speed + minimal ops** (spec §1) — the Owner is the sole builder and operator.
- **Run anywhere, including a home host behind NAT** — no assumption of a public domain.
- **Confidential data, minimal attack surface** (spec §6.1) — fewer public ingress points is better.

## Considered options

1. **Long-polling (`getUpdates`)** — the bot holds an outbound HTTP request and pulls updates as they arrive; no inbound endpoint.
2. **Webhook** — Telegram POSTs updates to a public HTTPS endpoint the bot exposes.

## Decision outcome

**Chosen:** Option 1 — long-polling. It needs no public HTTPS endpoint, domain, or TLS certificate, so the bot runs on any host (including a machine behind NAT) and has no inbound attack surface. Webhook's lower delivery latency is immaterial for a single-user reminder tool where the firing accuracy (±60 s) dominates, not update-intake latency.

## Consequences

**Positive**
- No public ingress → simplest deployment (§7) and no public endpoint to secure.
- Works behind NAT / on a home server / on a cheap VPS without a domain.

**Negative**
- Holds a long-lived outbound connection; on a transient network drop the loop must reconnect with backoff.
- Marginally higher update-delivery latency than webhook (irrelevant to the ±60 s firing NFR).

**Neutral**
- Switching to webhook later is a contained change to the ingress adapter (ports layer, §5) plus adding a public endpoint — not a data migration.

## Links

- Spec: [[../spec.md]] §1, §6.1
- SAD: [[../sad.md]] §4
- Related ADR: [[0001-node-typescript-grammy-runtime]]
