---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-06-13"
feature_size: "M"
ticket: "telegram-reminder"
---

# 0006 — Structure the bot as ports-and-adapters (hexagonal)

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** Mykhailo Podaniev (Owner / Architect)

## Context

The project is greenfield, so the internal layering convention is ours to set (§2). The bot has two external dependencies — the SQLite store (ADR-0002) and the Telegram Bot API (ADR-0003) — and the durability / at-least-once firing logic (ADR-0004, ADR-0005) is the part most in need of isolated, deterministic tests.

## Decision drivers

- **Testability of the firing path** (spec §2 Goal 3, §6 Durability) — the fire / re-fire logic must be verifiable without a live Telegram or a real DB.
- **Contained reversibility** of the two external choices — switching long-polling → webhook or SQLite → another store should touch adapters, not the domain.
- **Single small codebase** — the structure must not drown a personal tool in ceremony.

## Considered options

1. **Ports-and-adapters (hexagonal)** — domain + use cases at the centre; `ReminderRepository` and `TelegramGateway` are port interfaces; SQLite and grammY are adapters in `infra`.
2. **Simple layered (domain / service / infra)** — services call the repository and Telegram client concretely, no port interfaces.

## Decision outcome

**Chosen:** Option 1 — ports-and-adapters, kept light (ports only for the two real external edges: store and Telegram). `FireDueReminders` and the at-least-once transitions can then be unit-tested against an in-memory repository and a fake gateway, which is exactly the logic the dominant quality goal rides on. The extra interface boilerplate is small at two ports and pays for itself in the durability test suite.

## Consequences

**Positive**
- Goal-3 logic (fire, re-fire on unconfirmed delivery) is testable in isolation — no Telegram, no disk.
- ADR-0003 (intake) and ADR-0002 (store) become adapter swaps, not domain rewrites.

**Negative**
- Two port interfaces + their adapters are more files than a direct layered style.

**Neutral**
- Adding a third external edge later (e.g. a metrics sink) follows the same port/adapter pattern.

## Links

- Spec: [[../spec.md]] §2, §6
- SAD: [[../sad.md]] §5, §8
- Related ADR: [[0002-sqlite-embedded-store]], [[0003-long-polling-intake]], [[0005-at-least-once-delivery]]
