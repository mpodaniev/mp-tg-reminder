---
id: T15
title: "Document the webhook + wake deployment setup"
layer: "docs"
deps: ["T13"]
acs: ["AC-01", "AC-07"]
files_hint: ["docs/features/webhook-cron-wake/README.md"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T15 — Document the webhook + wake deployment setup

## Why

[sad.md §7 Deployment view](../sad.md) introduces new required configuration (webhook secret token, wake bearer token, the external scheduler's cadence) that isn't self-evident from the code — a solo-owner project needs this written down for a reproducible redeploy, and so the Owner can configure the external scheduler correctly (AC-01, AC-07).

## What

A short deployment note covering: the new required env vars (webhook secret token, wake bearer token, HTTP port), the one-time `setWebhook` registration step, the configured wake interval (3 minutes, sad.md §7) that the external scheduler must be set to call, and a pointer to the still-open idle-window question (sad.md §11 risk row) that needs post-deploy observation.

## Definition of Done

- [ ] Every new env var T13 introduced is listed with its purpose
- [ ] The external-scheduler cadence to configure (3 min) is stated explicitly, cross-referenced to sad.md §7
- [ ] The open idle-window question (sad.md §11) is flagged as needing post-deploy validation, not silently omitted

## Notes

Keep this to what's operationally necessary to redeploy — it links to sad.md/spec.md for the "why," it doesn't restate them.
