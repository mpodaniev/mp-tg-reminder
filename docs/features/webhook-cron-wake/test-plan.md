---
status: Draft
owner: "Mykhailo Podaniev"
reviewers: ["Mykhailo Podaniev", "Owner"]
updated_at: "2026-07-03"
feature_size: "M"
---

# Test plan — webhook-cron-wake

<!-- No live AskUserQuestion response was available for the per-AC level confirmation (60s
timeout, two rounds attempted); every level below is Claude's best-judgment default (the
"(Recommended)" option that would have been offered). Flagged here for the Owner's review
before `implement` consumes this map — same pattern as spec.md §8 and sad.md §§4/5/6/11. -->

Migrate the bot from long-polling to a Telegram webhook + authenticated periodic wake endpoint,
so the Fly.io machine can idle-stop between activity while still delivering reminders exactly
once, within a bounded delay, and rejecting any request without a verifiable origin.

## Levels

<!-- target_surfaces: [backend-service] (sad.md frontmatter) — no UI surface, so the
Component / Visual-regression / E2E-through-UI tiers do not apply and are dropped. -->

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Pure logic: wake-interval delay-estimate comparison, idempotency-skip decision, Scheduler drain-await sequencing with a fake tick — no I/O. | In-memory, no external dependency. |
| Integration | The module against a real dependency it owns: repositories (SQLite), the HTTP adapter, the Scheduler drain against a real DB. | An ephemeral real dependency — a throwaway SQLite file/tmpdir DB spun up per test, migrated fresh, matching the repo's existing integration-tier convention. |
| Contract | The webhook and wake HTTP boundary — request/response shape agreed with Telegram and the external scheduler in `contracts/openapi.yaml`. | Validate the real HTTP response against the `openapi.yaml` schemas (`TelegramUpdate`, `Ack`, `Error`); no hand-rolled stubs. |
| E2E | One full flow end to end, through the real HTTP entry point, against ephemeral dependencies (one per critical user story / sad.md §6 flow). | The flow exercised through the real `node:http` server + a real tmpdir SQLite DB + a fake/stub Telegram Bot API boundary (the only external system this process cannot itself stand up). |
| Load | NFR validation — only when an NFR carries a number. | <!-- N/A: see "NFR validation (load)" section below --> |

## AC coverage

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 — happy path | idle machine wakes and delivers a due reminder within the delay bound | unit + integration + e2e | reminder is delivered to the Owner; the machine is confirmed to have started and completed the check |
| AC-01 — happy path | due-reminders check reads and writes reminder state correctly against a real store | integration | `FireDueReminders` marks the occurrence firing then fired, durably, in the real DB |
| AC-01b — domain invariant | machine stays available until an in-flight tick fully resolves before idling again | unit | `Scheduler.stop()` awaits a still-running fake tick before resolving |
| AC-01b — domain invariant | a SIGTERM mid-tick does not leave a reminder in an unrecorded state | integration | after simulated shutdown mid-tick, the DB shows every touched reminder in a durably recorded state, never lost mid-write |
| AC-02 — happy path | forwarding + quick-pick + confirmation behave identically under webhook mode | e2e | Owner receives the same quick-pick choices and confirmation as before; no behavior change |
| AC-02 — happy path | webhook request/response shape matches the agreed contract | contract | `/webhook/telegram` request and 200 response conform to `TelegramUpdate`/`Ack` in `openapi.yaml` |
| AC-03 — error/estimate | a confirmed time sooner than the wake interval gets a delay-estimate reply, not a false immediacy promise | unit + e2e | reminder is still persisted; the Owner is told delivery may arrive up to one wake interval late |
| AC-03 — error/estimate | a confirmed time with headroom over the wake interval gets no delay estimate | unit | reminder is persisted with no delay-estimate wording appended |
| AC-04 — authorization | webhook request without a valid secret token is rejected | contract + integration | request rejected before any handler runs; no reminder or setting touched |
| AC-04 — authorization | wake request without a valid bearer token is rejected | contract + integration | request rejected before `tick()` runs; no reminder or setting touched |
| AC-04b — authorization | every message-handling code path denies action from a non-Owner Telegram sender, not only callback queries | integration | for each handler type (message-based custom-time reply, forwarded-message capture, callback query), a non-Owner sender's request is a no-op; Owner's data unchanged |
| AC-05 — domain invariant | a durable "awaiting custom time" prompt survives a simulated restart and is recognized on the next reply | integration | after the in-memory state is discarded and the process is recreated against the same DB, the Owner's next reply is matched to the pending prompt and the reminder is scheduled |
| AC-05 — domain invariant | an intervening unrelated forward cancels the previous pending prompt in favor of the new one | integration | `pending_prompt` singleton row is replaced (upsert), not duplicated; only the newest prompt is awaited |
| AC-06 — domain invariant | an occurrence already recorded fired is not re-sent when the wake check is retried | unit + integration | on a retried `tick()`, the already-fired occurrence is skipped; no second `send` call is made |
| AC-06 — domain invariant | a Snoozed reminder is treated as a new occurrence and fires again at its new time | integration | the new scheduled time creates a distinct fireable occurrence, independent of the original delivery record |
| AC-06 — domain invariant | end-to-end retry of the wake endpoint never produces a duplicate delivery | e2e | two consecutive calls to `/wake` covering the same due reminder result in exactly one delivered message |
| AC-07 — cross-context | reminders that became due during a gap in wake calls all fire once the next wake call succeeds | integration + e2e | every reminder due during the simulated gap is found by `findDuePending` with no age cutoff and is delivered exactly once, delayed but not lost |

## Edge cases / error paths

- Webhook request with a missing `X-Telegram-Bot-Api-Secret-Token` header → rejected, no handler invoked (AC-04)
- Webhook request with an invalid (non-matching) secret token → rejected, no handler invoked (AC-04)
- Wake request with a missing `Authorization` bearer header → rejected, no tick invoked (AC-04)
- Wake request with an invalid bearer token → rejected, no tick invoked (AC-04)
- Verified-Telegram-but-non-Owner sender on the custom-time text-reply handler (not just callback query) → denied, Owner's data unchanged (AC-04b)
- Verified-Telegram-but-non-Owner sender on the forwarded-message capture handler → denied, Owner's data unchanged (AC-04b)
- A reply arrives with no pending prompt found → treated as an unrelated message, not matched to any awaited custom time (AC-05, sad.md §6 Critical flow 3)
- A wake call arrives while an earlier wake call's tick is still in flight (overlapping calls) → the earlier tick still completes and durably records its results before the machine is allowed to idle (AC-01b)
- Send to Telegram fails after retries with backoff → occurrence is left in `firing` state (dead-letter), never re-sent automatically, surfaced for manual review rather than silently retried indefinitely (AC-06, favors not delivering again over delivering again)

## Test data

- Seed strategy: fixture builders matching `data-model.md` entities — `aPendingPrompt(overrides?)` (already specified in `data-model.md`, co-located under `src/infra/db/__tests__/`) plus the existing reminder/snapshot builders for `reminders` and `source_snapshots`, extended as needed for the new occurrence/delivery-state assertions in AC-06/AC-07.
- Integration dependency: an ephemeral real dependency — a throwaway tmpdir SQLite file, migrated fresh via the repo's existing migration runner (including the new `04_create_pending_prompt` migration), matching the current integration-tier convention (sad.md §2 Conventions). Not a mocked store.
- External-boundary stub: the Telegram Bot API itself (the one dependency this process cannot stand up locally) is exercised via a stub/fake HTTP boundary at the gateway edge for e2e tests — this is the sole permitted stub, since the real external system is out of the repo's control; every internal dependency (DB, HTTP adapter, scheduler) stays real.
- Cleanup boundary: per-test — each test gets its own tmpdir DB file, created before and deleted after, so runs are independent and parallel-safe.

## NFR validation (load)

<!-- N/A: no numeric NFR in spec.md §6 describes a throughput or concurrency target — this is a
single-Owner bot with no concurrent-request axis (sad.md §7 "Scaling thresholds: N/A"). The three
NFRs that do carry a number (delivery-delay p95 ≤5min, cold-start p95 ≤15s, unauthenticated
rejection 100%) are single-request timing/behavior bounds, not rate-under-load scenarios — they
are validated by elapsed-time assertions inside the AC-01/AC-01b integration+e2e tests above and
the AC-04 contract+integration tests above, not by a separate load-test tool. -->

## CI placement

- On every PR: unit, contract — fast, no external I/O beyond the ephemeral tmpdir DB the contract/integration tiers already use per-test.
- On schedule / pre-release: integration, e2e — heavier, exercise the full HTTP server + DB + fake-Telegram-boundary stack; e2e in particular walks multi-step flows (restart simulation, retry, gap catch-up) that don't need to gate every commit.
