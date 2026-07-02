---
status: Draft
owner: "Mykhailo Podaniev"
reviewers: ["Owner"]
updated_at: "2026-07-02"
feature_size: "M"
target_surfaces: [backend-service]
---

# Software Architecture Document — webhook-cron-wake

## 1. Introduction and goals

**Intent.** The bot (a single-Owner personal Telegram reminder tool) currently runs as an always-on Fly.io machine that long-polls the Telegram API continuously and separately runs an in-process 15-second timer to check for due reminders. This feature migrates the bot to a Telegram webhook plus an authenticated periodic "wake" endpoint that an external scheduler calls to trigger a due-reminders check — letting the platform safely stop and restart the machine between calls. It also closes pre-existing reliability gaps made worse by sleep/wake cycles: non-idempotent reminder delivery, non-durable "awaiting custom time" prompt state, inconsistent Owner-authorization (only `callback_query` handlers check the sender today), and a `SIGTERM` handler that doesn't await an in-flight scheduler tick before closing the DB.

**Top-3 quality goals (1-liners; full scenarios in §10):**

1. **Reliability of delivery** — reminders are never lost and never duplicated, delivered within an agreed delay bound even across machine sleep/wake cycles.
2. **Security of the new public perimeter** — the bot's first public inbound HTTP endpoints (webhook + wake) reject 100% of requests without a verifiable origin.
3. **Availability under intermittent host state** — the machine can fully stop, yet still meets the delivery-delay p95 bound and gracefully catches up on any missed wake cycle.

**Stakeholders.**

| Role | Interest | Sign-off owner? |
|---|---|---|
| Owner (CONTEXT.md) | sole user; wants reliable reminders regardless of machine state | No |
| Tech Lead (Mykhailo Podaniev) | SAD approval | Yes |

<!-- Decision overrides (¶4) — populated by the critic resolution loop, empty otherwise. -->

## 2. Constraints

**Technical.**
- TypeScript 5.4 (ES2022, NodeNext), Node.js `>=22` (`package.json:6`, `tsconfig.json`)
- `grammy` 1.21 + `@grammyjs/conversations` 1.2 (Telegram bot framework — supports both long-polling and webhook modes natively), `better-sqlite3` 9.4 (synchronous SQLite) (`package.json:18-22`)
- Hexagonal / ports-and-adapters layering: `domain` → `app` (use-cases + port interfaces) → `infra`/`ports` (adapters), manual constructor DI in the composition root (`src/main.ts:27-53`)
- No HTTP server or web framework exists in the codebase today (confirmed via dependency scan) — the webhook + wake endpoints are an entirely new inbound surface, not an extension of an existing listener

**Organisational.**
- Solo owner-developer (Mykhailo Podaniev), no team
- No hard deadline stated in spec.md; `feature_size: M` (1–2 sprints per the size matrix)
- Effort budget not explicitly quoted in the spec — flagged in §11 as an accepted gap

**Conventions.**
- Flyway-style migrations `NN_description.{up,down}.sql` in `migrations/`, tracked in `_migrations`, applied in sorted order (`src/infra/db/migrate.ts:24-42`); next number is `04`
- Manual constructor DI in the composition root (`src/main.ts:27-53`)
- Domain custom error classes extending `Error` with overridden `.name` (`src/domain/errors.ts:1-35`)
- Vitest tests, co-located `__tests__/*.test.ts`; integration tier uses a tmpdir SQLite DB
- No lint/static-analysis configured — a pre-existing gap, not introduced by this feature

**Regulatory / external.**
- Data classification: internal — personal reminder content for a single Owner; no new data classes introduced (spec §6.1)
- Security review required — this feature adds the bot's first public inbound endpoints and closes a pre-existing owner-authorization gap (spec §6.1)

## 3. Context and scope

The bot serves a single Owner on Telegram: the Owner forwards a message, picks a time, and the bot fires a reminder back into the chat at that time. Today the bot only makes outbound calls to Telegram (long-polling) — nothing external can reach in. This feature opens two new inbound trust boundaries: a Telegram webhook (replacing polling) and a periodic wake endpoint called by an external scheduler, so the hosting platform can idle-stop the machine between activity and still deliver time-based reminders.

<!-- brownfield: TypeScript/grammy/better-sqlite3 bot; hexagonal layering (domain/app/infra/ports/scheduler); no existing HTTP listener; fresh scan via sdd:explorer on commit 804889a (docs/architecture-map.md predates this by 15 commits). -->

**External systems (in / out):**

| Actor or system | Type | Interaction |
|---|---|---|
| Owner | Person | Forwards messages, picks times, replies to prompts, receives reminders — via Telegram |
| Telegram Bot API | System (external) | Delivers updates via webhook POST; receives outbound send/edit/delete calls from the bot |
| External wake scheduler | System (external) | Calls the periodic wake endpoint on a fixed interval to trigger a due-reminders check |
| Fly.io platform | System (external) | Hosts the machine; auto-stops it when inbound HTTP activity is idle, auto-starts it on the next inbound request |

**C4 Context (L1):**

```mermaid
C4Context
    title webhook-cron-wake — System Context

    Person(owner, "Owner", "Forwards messages, picks times, receives reminders")
    System(bot, "Telegram Reminder Bot", "Captures messages, schedules and fires reminders")
    System_Ext(telegram, "Telegram Bot API", "Delivers updates via webhook; sends/edits/deletes messages")
    System_Ext(scheduler_ext, "External wake scheduler", "Calls the wake endpoint on a fixed interval")
    System_Ext(fly, "Fly.io platform", "Hosts the machine; auto-stops/starts on inbound HTTP activity")

    Rel(owner, telegram, "Forwards messages / taps buttons / replies", "Telegram client")
    Rel(telegram, bot, "Delivers updates", "HTTPS webhook")
    Rel(bot, telegram, "Sends/edits/deletes reminder messages", "HTTPS")
    Rel(scheduler_ext, bot, "Triggers a due-reminders check", "HTTPS wake call")
    Rel(fly, bot, "Stops/starts the machine based on inbound HTTP activity", "platform-internal")
```

## 4. Solution strategy

**Top strategic choices (the seeds for ADRs):**

1. **Target surface: `backend-service`** — the bot has no UI surface beyond the Telegram client (mediated entirely through the existing grammy integration, not a surface this feature builds); webhook + wake are new HTTP endpoints of the same single deployable process. `target_surfaces: [backend-service]` is written to this document's frontmatter.
2. **Wake call as the sole trigger for due-reminder checks** (→ ADR-0001) — the internal 15-second `setInterval` is removed; `FireDueReminders`/`ExpireStalePrompts` run only when the external wake HTTP endpoint is called. This is the only way the machine can actually reach a fully-stopped state, which is this feature's core premise; AC-07's no-cutoff catch-up semantics already cover the reliability gap a fallback timer would otherwise fill.
3. **`node:http` for the webhook and wake endpoints** (→ ADR-0002) — no HTTP framework exists in the codebase today, and the project's standing instruction is to never add a dependency without an explicit request. Two routes don't need routing/middleware machinery to stay readable.
4. **Owner-authorization centralized in a single router-dispatch gate** (→ ADR-0003) — one `isOwner()` check in `buildRouter`, before any handler runs, replacing the inconsistent pattern where only `callback_query` is checked today (`src/ports/router.ts:62-66`) while the custom-time text-input path (`src/ports/router.ts:56-59`) is not. This closes AC-04b at its root and Owner-gates any handler added later by construction.
5. **Graceful shutdown drains the in-flight tick** — `Scheduler.stop()` becomes `async` and awaits any in-flight tick before returning; `src/main.ts`'s `SIGTERM`/`SIGINT` handler (`src/main.ts:81-91`) awaits `scheduler.stop()` before calling `db.close()`. This closes AC-01b and is the primary defense for AC-06's idempotent-delivery requirement — it removes the race window between a successful Telegram send and the durable "fired" write. Scored against the blast-radius gate: touches 2 modules (`main.ts` + `scheduler.ts`) but is cheap to reverse and has no serious alternative given AC-01b's explicit wording — kept inline, no ADR.
6. **Wake-endpoint authentication: a static bearer token in an environment variable, checked in constant time** — the external scheduler is entirely under the Owner's control, so a shared secret is sufficient; rotation is a manual env-var change. The Telegram webhook is authenticated separately via grammy's built-in `secretToken` mechanism (the `X-Telegram-Bot-Api-Secret-Token` header) — an industry-standard convention with no serious alternative, so it is not treated as a separate decision. Scored against the gate: single module, low irreversibility (rotating the scheme is a config change) — kept inline, no ADR.

Each tactical decision in later sections should trace to one of these seeds.

<!-- No live AskUserQuestion response was available for DEC-4b/4c/4d/4e during this Socratic pass (60s timeout); the Recommended option was applied per Auto Mode and is flagged here for the Owner's review before this SAD is treated as final. -->

## 5. Building block view

## 6. Runtime view

## 7. Deployment view

## 8. Crosscutting concepts

## 9. Architecture decisions

| # | Title | Status | Section |
|---|---|---|---|
| 0001 | Use the external wake call as the sole trigger for due-reminder checks | Accepted | §4 |
| 0002 | Use Node's built-in http module for the webhook and wake endpoints | Accepted | §4 |
| 0003 | Centralize Owner authorization in a single router-level gate | Accepted | §4 |

ADR files live under `docs/features/webhook-cron-wake/adr/NNNN-<title>.md`.

## 10. Quality requirements

## 11. Risks and technical debt

## 12. Glossary
