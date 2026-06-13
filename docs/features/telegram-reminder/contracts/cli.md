---
feature: telegram-reminder
contract_kind: bot-protocol
surface: backend-service
generated_from:
  - data-model.md
  - sad.md §6 (Flows 1–8)
  - spec.md §4–§5
updated_at: 2026-06-13
---

# Bot Protocol Contract — telegram-reminder

> **Surface rationale:** `target_surfaces: [backend-service]` (sad.md frontmatter). ADR-0003
> (long-polling) means zero inbound HTTP ports — no OpenAPI surface. The bot's external
> interface is the Telegram Bot Protocol: slash commands, forwarded messages, and inline keyboard
> callback queries. This maps to the **CLI** contract form.

---

## Overview

Single-Owner personal Telegram bot. Every incoming update is validated against
`owner_settings.owner_telegram_id` before any processing (AC-09). Non-Owner updates are
silently discarded — no reply, no data stored.

**State machine (from data-model.md):**

```
awaiting_time → pending → firing → fired → done | deleted
awaiting_time → expired  (24 h timeout — no Owner response)
fired         → pending  (Snooze)
```

---

## 1. Commands

### `/settings`

| Item | Value |
|---|---|
| Trigger | Owner sends `/settings` |
| Purpose | Configure Owner home timezone (IANA string). Required before any capture (AC-13). |
| Precondition | None — works even before timezone is configured |
| State change | Writes / updates `owner_settings` (singleton `id = 1`); sets `timezone` |
| Response (happy path) | Bot presents timezone input prompt; confirms "Timezone set: Europe/Kyiv" |

**Fields written:**

| Field | Origin | Constraint |
|---|---|---|
| `owner_settings.owner_telegram_id` | `update.from.id` | NOT NULL; persisted on first call |
| `owner_settings.timezone` | Owner text input | IANA timezone string; NOT NULL after set |

**Error paths:**

| Condition | Internal code | Bot response |
|---|---|---|
| Submitted value is not a valid IANA timezone | `settings.invalid_timezone` | "Невідомий часовий пояс. Введіть коректний IANA рядок (наприклад, Europe/Kyiv)." |

> **Gap OQ-API-01 (Save-as-OQ — owner: specify, due: before tasks):** No user story or §6 flow
> covers `/settings`. It is implied by AC-13 but its input grammar, confirmation UX, and error
> handling are unspecified. The entries above are inferred from AC-13 and data-model.md — confirm
> before implementation.

---

## 2. Message Triggers

### 2.1 Forwarded Message → Capture (US-01 | AC-01, AC-09, AC-13 | Flow 1, Flow 3)

**Trigger:** Owner forwards any Telegram message to the bot (`message.forward_origin` present).

#### Authorization gate (AC-09 — runs first on every update)

| Sender | Behavior |
|---|---|
| `update.from.id == owner_settings.owner_telegram_id` | Proceed |
| Any other `user_id` | Silent discard — no reply, no data written |

**Internal code on discard:** `auth.not_owner`

#### Setup gate (AC-13)

| Condition | Behavior |
|---|---|
| `owner_settings.timezone IS NULL` | Do not capture. Reply: "Спершу налаштуйте часовий пояс — /settings." No snapshot or reminder row written. |

**Internal code:** `settings.timezone_required`

#### Happy path (AC-01) — timezone configured

**Rows written (one transaction):**

*`source_snapshots`*

| Field | Origin | Constraint |
|---|---|---|
| `chat_id` | `message.forward_origin.chat.id` | NOT NULL |
| `message_id` | `message.forward_origin.message_id` | NOT NULL |
| `chat_username` | `message.forward_origin.chat.username` | NULLABLE — absent for private chats |
| `sender_name` | `message.forward_origin.sender_user.first_name` | NULLABLE |
| `sender_username` | `message.forward_origin.sender_user.username` | NULLABLE |
| `message_text` | `message.text` or `message.caption` | NULLABLE — NULL for media-only messages |
| `media_file_id` | `message.photo[-1].file_id` / `message.video.file_id` / etc. | NULLABLE |
| `media_type` | derived from Telegram update type (`photo`, `video`, `document`, …) | NULLABLE |
| `is_media_protected` | `message.has_protected_content` → `1` / `0` | NOT NULL |
| `created_at` | `Date.now()` (UTC ms) | NOT NULL |

*`reminders`*

| Field | Value | Constraint |
|---|---|---|
| `snapshot_id` | FK → new `source_snapshots.id` | NOT NULL |
| `state` | `awaiting_time` | NOT NULL |
| `scheduled_at` | NULL | awaiting_time phase |
| `created_at` | `Date.now()` (UTC ms) | NOT NULL |

**Bot reply:** Inline keyboard prompt — "Коли нагадати?"

```
[ In 1 hour ]  [ This evening 19:00 ]
[ Tomorrow morning 07:00 ]  [ In a week ]
[ Custom time ]
```

Callback data format: `{action}:{reminder_id}` (UTF-8 string, ≤64 bytes).

| Button | Callback data |
|---|---|
| In 1 hour | `q_1h:{id}` |
| This evening 19:00 | `q_evn:{id}` |
| Tomorrow morning 07:00 | `q_tmr:{id}` |
| In a week | `q_1w:{id}` |
| Custom time | `q_ctime:{id}` |

---

### 2.2 Custom-time text input (US-03 | AC-03, AC-08 | Flow 4)

**Trigger:** Owner sends a plain-text message while a reminder is in `awaiting_time` state and the
bot is waiting for a custom-time expression.

**Input grammar** (from spec §8 OQ-1, now resolved):
- Relative: `"за 2 год"`, `"завтра 15:00"`, `"через тиждень"`
- Structured: `DD.MM.YYYY HH:MM`
- Date-only → defaults to 09:00 in Owner timezone
- Time-only → next future occurrence in Owner timezone

**Parsing context:** `owner_settings.timezone` (must be set — AC-13 gate already ran on capture).

#### Happy path (AC-03) — time is in the future

| Field | Value |
|---|---|
| `reminders.state` | `pending` |
| `reminders.scheduled_at` | Resolved UTC epoch ms |

Bot reply: `"Нагадаю [human-readable time in Owner timezone]."` (e.g. "Нагадаю завтра о 15:00.")

#### Error path (AC-08) — time is in the past

| Condition | Internal code | Bot response |
|---|---|---|
| Resolved UTC time ≤ `Date.now()` | `reminder.time_in_past` | "Час нагадування має бути в майбутньому. Введіть новий час." |

Reminder stays in `awaiting_time` — no `scheduled_at` written.

---

## 3. Callback Queries

All callbacks: Owner-ID auth gate runs first (AC-09).  
Callback data format: `{action}:{reminder_id}`.

---

### 3.1 Quick-pick time selection (US-02 | AC-02 | Flow 1 — scheduling step)

**Trigger:** Owner taps a quick-pick button from the capture prompt.
**Callback data:** `q_1h:{id}` | `q_evn:{id}` | `q_tmr:{id}` | `q_1w:{id}`
**Precondition:** Reminder is in `awaiting_time` state.

**Computation:**

| Preset | Resolution |
|---|---|
| `q_1h` | `Date.now() + 1 hour` (UTC) |
| `q_evn` | Today 19:00 in `owner_settings.timezone`, converted to UTC |
| `q_tmr` | Tomorrow 07:00 in `owner_settings.timezone`, converted to UTC |
| `q_1w` | `Date.now() + 7 days` (UTC) |

**State change:**

| Field | Value |
|---|---|
| `reminders.state` | `pending` |
| `reminders.scheduled_at` | Computed UTC epoch ms |

Bot reply: `"Нагадаю [human-readable time in Owner timezone]."` — acknowledgement message.

---

### 3.2 Custom-time initiation (US-03 | AC-03 | Flow 4 — callback step)

**Trigger:** Owner taps "Custom time" from the capture prompt.
**Callback data:** `q_ctime:{id}`
**Precondition:** Reminder is in `awaiting_time` state.

Bot sends free-text prompt: `"Введіть дату або час нагадування."` Reminder stays `awaiting_time`. Subsequent text message handled by §2.2.

---

### 3.3 Snooze — initiation (US-05 | AC-05, AC-10 | Flow 6)

**Trigger:** Owner taps "Snooze" on a fired-reminder message.
**Callback data:** `snooze:{id}`

**Guard — state check:**

| Reminder state | Internal code | Bot response |
|---|---|---|
| `done` or `deleted` | `reminder.invalid_state` | "Нагадування вже вирішено — подальші дії неможливі." (AC-10) |
| `fired` | — | Show snooze time options (see below) |

**Snooze options keyboard** (only future wall-clock times shown; past options hidden — AC-05):

| Button | Callback data |
|---|---|
| In 1 hour | `sq_1h:{id}` |
| This evening 19:00 | `sq_evn:{id}` (hidden if past 19:00) |
| Tomorrow morning 07:00 | `sq_tmr:{id}` (always future) |
| In a week | `sq_1w:{id}` |
| Custom time | `sq_ctime:{id}` |

---

### 3.4 Snooze — time selection (US-05 | AC-05 | Flow 6 — reschedule step)

**Trigger:** Owner taps a snooze quick-pick.
**Callback data:** `sq_1h:{id}` | `sq_evn:{id}` | `sq_tmr:{id}` | `sq_1w:{id}`
**Precondition:** Reminder is in `fired` state (guard already ran in §3.3).

**Computation:** same preset-to-UTC logic as §3.1.

**State change:**

| Field | Value |
|---|---|
| `reminders.state` | `pending` |
| `reminders.scheduled_at` | New computed UTC epoch ms |

Bot edits the fired-reminder message to show rescheduled state (AC-05).

---

### 3.5 Snooze — custom time initiation (US-05 | AC-05 | Flow 6)

**Callback data:** `sq_ctime:{id}`

Bot sends free-text prompt: `"Введіть новий час нагадування."` Subsequent text message is handled by the same custom-time parser (§2.2), targeting the `fired` → `pending` transition rather than `awaiting_time` → `pending`.

---

### 3.6 Done (US-06 | AC-06 | Flow 7)

**Trigger:** Owner taps "Done" on a fired-reminder message.
**Callback data:** `done:{id}`
**Precondition:** Reminder is in `fired` state.

**State change:**

| Field | Value |
|---|---|
| `reminders.state` | `done` |

**Message deletion:**

| Condition | Behavior |
|---|---|
| Telegram accepts deletion | Fired-reminder message removed from chat. Cleared-inbox invariant holds. (AC-06 happy path) |
| Deletion rejected (message > 48 h) | Bot edits message to resolved placeholder: `"[Нагадування виконано]"`. Cleared-inbox invariant holds visually. (AC-06 fallback) |

**Fields read:** `reminders.fired_message_id` (to target the correct message for delete/edit).

---

### 3.7 Delete (US-07 | AC-07 | Flow 7)

**Trigger:** Owner taps "Delete" on a fired-reminder message.
**Callback data:** `del:{id}`
**Precondition:** Reminder is in `fired` state.

**State change:**

| Field | Value |
|---|---|
| `reminders.state` | `deleted` |

**Message deletion:** Same logic as §3.6 (delete → fallback edit to `"[Нагадування видалено]"`).

---

### 3.8 Go to source (US-08 | AC-11 | Flow 8)

**Trigger:** Owner taps "Go to source" on a fired-reminder message.
**Callback data:** `gosrc:{id}`

**Fields read:** `source_snapshots.chat_username`, `source_snapshots.message_id`.

| Condition | AC | Bot response |
|---|---|---|
| `chat_username IS NOT NULL` AND `message_id IS NOT NULL` | AC-11 happy path | Send deep link: `https://t.me/{chat_username}/{message_id}` |
| `chat_username IS NULL` OR `message_id` unavailable | AC-11 fallback | `"Пряме посилання недоступне для цього джерела."` + captured `message_text` inline. Internal code: `source.link_unavailable` |

---

## 4. Proactive Scheduler Actions

### 4.1 Reminder Fire (US-04 | AC-04, AC-12 | Flow 2, Flow 5)

**Trigger:** Internal polling-tick (≈15 s interval, ADR-0004). Not a user-initiated callback.

**Store query:**

```sql
SELECT r.*, s.*
FROM reminders r
JOIN source_snapshots s ON s.id = r.snapshot_id
WHERE r.state = 'pending'
  AND r.scheduled_at <= unixepoch('now') * 1000
```

*(Uses index `idx_reminders_state_scheduled_at` on `(state, scheduled_at)`.)*

**State transition (at-least-once, ADR-0005):**

```
pending → firing   (mark before Telegram send)
firing  → fired    (on Telegram delivery ack; set fired_at, delivered_at, fired_message_id)
firing  → firing   (restart: no delivered_at → re-fire on next tick)
```

**Fired-reminder message format:**

| Element | Condition | Source field |
|---|---|---|
| Source text | `message_text IS NOT NULL` | `source_snapshots.message_text` |
| Media | `media_file_id IS NOT NULL` AND `is_media_protected = 0` | `source_snapshots.media_file_id` |
| Media-unavailable note | `is_media_protected = 1` OR file reference expired | Static: `"(Медіа недоступне через обмеження джерела.)"` |
| Sender attribution | `sender_name IS NOT NULL` | `source_snapshots.sender_name` |
| Action buttons | Always | Snooze \| Done \| Delete \| Go to source |

**Fields written on fire:**

| Field | Value |
|---|---|
| `reminders.state` | `firing` (before send), `fired` (after ack) |
| `reminders.fired_at` | `Date.now()` at fire attempt (UTC ms) |
| `reminders.delivered_at` | `Date.now()` on Telegram delivery ack (UTC ms) |
| `reminders.fired_message_id` | Telegram `message_id` of the sent reminder message |

**Retry / dead-letter:**

| Condition | Behavior |
|---|---|
| Transient Telegram / network error | Retry up to 3× with exponential backoff |
| Exhausted retries | Leave `state = firing`; internal log: `delivery.retries_exhausted`. Re-fires on next tick after restart. |

**Protected-content path (AC-12):** `is_media_protected = 1` → send text + static note; all action buttons present.

---

### 4.2 Expiry (spec §8 OQ-3 — resolved)

**Trigger:** Polling-tick detects reminder in `awaiting_time` with `created_at` older than 24 h.

**State change:** `reminders.state → expired`.

Bot sends notification to Owner: `"Нагадування відхилено — ви не обрали час протягом 24 годин."` The source snapshot row is retained (no delete) per data-model.md (snapshot has no lifecycle independent of reminder).

> **Gap OQ-API-02 (Save-as-OQ — owner: sequences, due: before tasks):** No §6 sequence covers
> the expiry flow. The behavior above is inferred from spec §8 OQ-3 and the state machine
> (data-model.md). A Flow 9 should be added to sad.md §6 to make this explicit.

---

## 5. Authorization Model

Authorization is a crosscutting guard, not a per-handler opt-in (sad.md §8).

```
incoming update
  → validate update.from.id == owner_settings.owner_telegram_id
     ✗ → silent discard (no reply, no write)     [auth.not_owner]
     ✓ → proceed to handler
```

**Fields read:** `owner_settings.owner_telegram_id` (singleton read on every update).

**Owner bootstrap:** Before `owner_settings` row exists (first ever message), the bot cannot validate Owner ID and must reject all messages. The `/settings` command must therefore be handled via a pre-registered `OWNER_TELEGRAM_ID` env-var or a first-use bootstrap flow (implementation detail — not specified in spec; see OQ-API-01).

---

## 6. Internal Error Codes

Error codes follow the neutral `module.error_name` convention (no stack-specific idioms). User-facing messages are in Ukrainian.

| Code | Trigger | User-facing message |
|---|---|---|
| `auth.not_owner` | Non-Owner update (AC-09) | *(silent discard — no message sent)* |
| `reminder.not_found` | `reminder_id` does not exist in DB | `"Нагадування не знайдено."` |
| `reminder.invalid_state` | Action not allowed in current state (AC-10) | `"Нагадування вже вирішено — подальші дії неможливі."` |
| `reminder.time_in_past` | Custom time resolves to past UTC (AC-08) | `"Час нагадування має бути в майбутньому. Введіть новий час."` |
| `settings.timezone_required` | Capture before timezone set (AC-13) | `"Спершу налаштуйте часовий пояс — /settings."` |
| `settings.invalid_timezone` | Invalid IANA string in `/settings` | `"Невідомий часовий пояс. Введіть коректний IANA рядок."` |
| `source.link_unavailable` | Deep link unavailable (AC-11 fallback) | `"Пряме посилання недоступне для цього джерела."` |
| `delivery.retries_exhausted` | 3 Telegram retries failed (Flow 2, Flow 5) | *(internal log only — no user message; reminder stays firing)* |

---

## 7. Anti-flood Guard

| Constraint | Value | Source |
|---|---|---|
| Max outbound bot messages | ≤ 10 per 60 s window | spec §6 |
| On Telegram 429 / flood-wait | Respect `retry_after`; exponential backoff | sad.md §8 |

---

## 8. Open Questions (tracked here)

| ID | Description | Owner | Due |
|---|---|---|---|
| OQ-API-01 | `/settings` command: input grammar, confirmation UX, Owner-ID bootstrap. No US or §6 flow covers it. | specify | before tasks |
| OQ-API-02 | Expiry flow (awaiting_time → expired after 24 h): no §6 sequence. Add Flow 9 to sad.md §6. | sequences | before tasks |
