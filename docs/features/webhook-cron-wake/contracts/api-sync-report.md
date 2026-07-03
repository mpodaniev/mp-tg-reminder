---
status: Draft
owner: "Backend Lead"
reviewers: ["Owner"]
updated_at: "2026-07-03"
feature_size: "M"
---

# API sync report — webhook-cron-wake

Contract: `contracts/openapi.yaml`. Derived from `data-model.md` (1 new entity: `pending_prompt`),
`sad.md` §6 (5 sequence diagrams) + §4/§5/§8, and `spec.md` §4/§5/§6.1. **No `events.md`** — sad.md
§8 records "Events: N/A — no event bus introduced; the wake call is a direct HTTP-triggered method
call, not an async event."

**Interface kind:** read from `sad.md` frontmatter `target_surfaces: [backend-service]` — HTTP/REST,
OpenAPI 3.1 path taken, no fallback derivation needed.

**Shape note:** both endpoints are *action* endpoints (webhook relay, wake trigger), not resource
CRUD. Neither returns or accepts a list, so the cursor-pagination convention in the skill template
does not apply to this feature — recorded here rather than forced into an unused schema.

## Section A — field-origins table

| schema_path | origin | confidence |
|---|---|---|
| `receiveTelegramUpdate.header.X-Telegram-Bot-Api-Secret-Token` | sad.md §4 decision 6 — grammy's built-in `secretToken` mechanism | high |
| `receiveTelegramUpdate.requestBody` (`TelegramUpdate`) | external — Telegram Bot API's own `Update` schema, opaque pass-through per sad.md §5 `webhook-handler.ts` | high (deliberately untyped — see note below) |
| `receiveTelegramUpdate.200` (`Ack`, empty) | sad.md §6 Critical flow 2/3 — both branches converge on "handled" / "200 OK" | high |
| `receiveTelegramUpdate.401.code` (`webhook.invalid_secret_token`) | derived — `module.error_name` convention; sad.md §6 Critical flow 2 `alt secretToken invalid` | medium — proposed, no existing HTTP error registry (see checklist point 2) |
| `triggerWake.header.Authorization` (Bearer) | sad.md §4 decision 6 — static bearer token, constant-time check | high |
| `triggerWake.200` (`Ack`, empty) | sad.md §6 Critical flow 1/4/5 — all end "tick complete" / "200 OK", no response fields specified anywhere upstream | high |
| `triggerWake.401.code` (`wake.invalid_token`) | derived — `module.error_name` convention; sad.md §6 Critical flow 1 `alt token invalid` | medium — proposed, no existing HTTP error registry |

No `low`-confidence rows — both endpoints are thin enough that every field traces directly to a
named sad.md flow step or an explicit spec.md AC; nothing was inferred from a message name alone.

## Section B — drift findings (4-point checklist)

1. **Endpoint ↔ data-model** *(core)* — ✓, via the documented fallback. Neither endpoint maps
   1:1 onto a `data-model.md` entity write the way a CRUD resource would (the webhook is a relay
   into the Router/use-case layer; the wake endpoint invokes `Scheduler.tick()`, which in turn
   reads/writes `reminders` and the new `pending_prompt` table several layers downstream). Per
   drift-check.md point 1's own fallback ("absent sad.md, fall back to: every endpoint maps to a
   §4 user story") — applied here directly since these are action endpoints, not resource
   endpoints: `receiveTelegramUpdate` → US-02, US-03, US-05; `triggerWake` → US-01, US-04, US-06,
   US-05. Every §4 story maps to ≥1 operation.

2. **Error code ↔ repo error definition** *(core)* — ✓ with a note, not a failure. The repo's only
   existing error registry is `src/domain/errors.ts` (domain-layer sentinel classes: `UnauthorizedError`,
   etc.) — no HTTP-layer error-code registry exists yet, because `ports/http/` is itself new
   (ADR-0002). Both 401 codes (`webhook.invalid_secret_token`, `wake.invalid_token`) are rejected
   *before* any use-case or domain error is raised (sad.md §6: "rejects, no action taken" happens
   at the HTTP adapter, one step before Router/AppLayer), so they don't correspond to an existing
   domain error class by design — they are this contract's proposal for the new adapter's own
   error vocabulary, per drift-check.md's guidance for a repo with no central list yet.

3. **Validation ↔ constraint** *(core)* — ✓, vacuously. Neither endpoint has body fields sourced
   from `data-model.md` columns to validate against (the webhook body is Telegram's own opaque
   schema; the wake endpoint has no request body at all) — no `maxLength`/`pattern`/`enum`
   conflict is possible because there is no modeled field on either request.

4. **OpenAPI ↔ sequence** *(supporting)* — ✓ with one flagged, intentional deviation. All 5
   sad.md §6 flows resolve into exactly these two operations and their `200`/`401` responses; no
   orphan sequence and no missing branch. **Flag:** the skill's default rule ("a mutating endpoint
   whose §6 flow shows a retry note ⇒ `Idempotency-Key`-required") would apply to `/wake` (Critical
   flow 4 is explicitly a retry scenario). This contract does **not** add an `Idempotency-Key`
   header — resolved as **Accept as is**: sad.md §8's Idempotency row states the invariant is
   enforced at the domain-state level (an occurrence already recorded `fired` is never re-sent,
   AC-06), which covers retries from *any* caller/key and survives a process restart between the
   two calls — strictly stronger than a client-supplied key with a TTL window, and the only
   mechanism that also satisfies AC-07 (a duplicate check that is really a legitimately-new,
   uncorrelated wake cycle after a gap must still fire due reminders, which a shared idempotency
   key would not distinguish from a true retry). Recorded here rather than silently added, since
   it's a real divergence from the generic template default — not an oversight.

**Flags this run: 1** (the Idempotency-Key deviation above, self-resolved Accept-as-is with
rationale traced to sad.md §8 + AC-06/AC-07). No core point failed; below the ≥3-flag pause
threshold — proceeding to write, per protocol.

## Back-feed coverage cross-check

| spec.md §5 AC | Operation / response | Note |
|---|---|---|
| AC-01, AC-01b | `triggerWake` 200 | Critical flow 1 |
| AC-03 | `triggerWake` 200 (delay estimate is composed by the app layer on the *webhook* confirmation path, Critical flow 1b — not itself a distinct wake-endpoint response) | see caveat below |
| AC-02 | `receiveTelegramUpdate` 200 | Critical flow 1b/2 — unchanged chat behavior, no new HTTP-visible shape |
| AC-04 | both `401` responses | Critical flows 1, 2, 3, 5 |
| AC-04b | `receiveTelegramUpdate` 200 (silent no-op branch) | Critical flow 2/3 — authz outcome is internal, not HTTP-visible, by design |
| AC-05 | `receiveTelegramUpdate` 200 | Critical flow 3 |
| AC-06 | `triggerWake` 200 (idempotent-skip branch, internal) | Critical flow 4 |
| AC-07 | `triggerWake` 200 | Critical flow 5 |

**Caveat on AC-03:** Critical flow 1b's confirmation-message content (the delay estimate) is
composed and sent by the app layer over the *existing* Telegram send path (`AppLayer→Infra`,
`Router-->>HttpAdapter: reply`), not returned in this contract's HTTP response bodies — the
Owner-facing confirmation arrives as a Telegram message, not as JSON in `receiveTelegramUpdate`'s
response. No gap: this is correctly outside the HTTP contract's surface, same as every other
Owner-facing reminder message sent via the existing `GrammyTelegramGateway` (unchanged by this
feature per sad.md §5).

Every operation maps to ≥1 §4 user story and ≥1 AC (Section B point 1). Every sad.md §6
`alt`-branch has a corresponding response or documented internal-only outcome — no sequence gap
found; no Save-as-OQ needed for this stage's own artifacts.

## Definition of Done — status

- [x] `contracts/openapi.yaml` written: OpenAPI 3.1, per-operation security (`TelegramSecretToken`
      / `WakeBearerAuth` — no single global scheme fits both endpoints' distinct auth schemes),
      every error response the `{code, message, details?}` envelope, every operation with a
      request + success + error example, `Error`/`Ack`/`TelegramUpdate` all `$ref`'d.
- [x] `api-sync-report.md` (this file): field-origins table + 4-point checklist, all 4 points ✓
      (1 self-resolved supporting-point flag, documented above).
- [x] Every endpoint maps to a §4 user story; every field traces to its origin (data-model.md has
      no fields surfaced at the HTTP layer directly — both request bodies are either opaque
      external schema or absent).
- [ ] `contracts/events.md` — N/A, no async flows (sad.md §8); correctly skipped.

## Open items carried forward (not this skill's to resolve)

- sad.md §11 already tracks: the idle-window value, the ~10 auto-resolved `<!-- Assumed -->`
  markers across sad.md + ADRs 0001–0003, and the router-refactor regression risk. None of these
  affect the contract shape itself — recorded here only so a reviewer doesn't need to re-derive
  that this report is aware of them.
- The wake interval (3 min, sad.md §7) and idle-window are deployment/config values, not part of
  the HTTP contract — no `server_variable` was added for them since neither is a per-request
  parameter.
