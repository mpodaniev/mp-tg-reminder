---
status: Living
updated_at: "2026-07-02"
---

# Domain Context — webhook-cron-wake

## Glossary

- **idle window** — the platform's own auto-stop threshold: how long the machine sits with no inbound HTTP activity before the platform stops it. NOT wake interval — the idle window is set by the hosting platform and does not by itself affect reminder-delivery timing.
- **wake interval** — the period between calls from the external scheduler to the wake endpoint; directly bounds the delivery-delay NFR. NOT idle window — earlier drafts of this spec also called it "check interval" or "expected cycles"; all refer to this same value.
