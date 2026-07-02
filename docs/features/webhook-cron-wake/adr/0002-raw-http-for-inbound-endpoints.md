---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: []
updated_at: "2026-07-02"
feature_size: "M"
ticket: "webhook-cron-wake"
---

# 0002 — Use Node's built-in http module for the webhook and wake endpoints

- **Status:** Accepted
- **Date:** 2026-07-02
- **Deciders:** Mykhailo Podaniev (Architect), no live response during the Socratic walk — Recommended default applied per Auto Mode, flagged for review.

## Context

The bot has no HTTP server today — `package.json` lists only `grammy`, `@grammyjs/conversations`, `better-sqlite3` (confirmed via a fresh dependency scan). This feature adds the bot's first two inbound HTTP endpoints (the Telegram webhook and the wake endpoint), which requires some HTTP listener. A decision is needed on what serves that listener.

## Decision drivers

- The user's global CLAUDE.md instructs: "Never install any packages without an explicit request from the user. Do not install 'related' or 'useful' packages proactively" — no live confirmation was available during this Socratic pass to get that explicit request.
- Only two routes are needed (webhook + wake) — a minimal surface that doesn't obviously need routing/middleware machinery.
- Spec §6.1: both endpoints are new trust boundaries requiring careful, auditable request handling — simpler code is easier to review for a security-sensitive surface.

## Considered options

1. **Node's built-in `http` module** — `node:http`, zero new dependencies, hand-rolled route matching and body parsing for the two endpoints.
2. **A lightweight HTTP framework** (e.g. `hono`, `express`) — richer routing/middleware ergonomics, at the cost of a new dependency.

## Decision outcome

**Chosen:** Option 1, `node:http`. This is the only option compatible with the standing "no packages without explicit request" instruction absent a live confirmation, and two routes do not need a framework's routing/middleware layer to stay readable.

## Consequences

**Positive**
- Zero new dependencies — no new supply-chain surface, no version to track, fully compliant with the standing project instruction.
- Nothing to learn or configure beyond the standard library; the whole HTTP layer is a few dozen lines the Owner can audit end-to-end.

**Negative**
- Manual route matching and JSON body parsing for both endpoints — a framework would provide this for free.
- If the bot later grows more HTTP surface (more endpoints, richer routing needs), this becomes the first thing worth reconsidering.

**Neutral**
- Swapping to a framework later is a contained, local change (the endpoints' business logic doesn't change, only their wiring) — revisit if/when the Owner explicitly requests a framework dependency.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
- Related ADR: none
