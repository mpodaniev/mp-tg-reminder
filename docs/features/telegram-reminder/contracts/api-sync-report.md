---
feature: telegram-reminder
contract: contracts/cli.md
generated_from:
  - data-model.md
  - sad.md §6 (Flows 1–8)
  - spec.md §4–§5
updated_at: 2026-06-13
---

# API Sync Report — telegram-reminder

Contract kind: **bot-protocol / CLI** (no HTTP surface — ADR-0003 long-polling).
Drift check runs against: `data-model.md` + `sad.md §6` + `spec.md §5`.

---

## Section A — Field-Origins Table

One row per `(handler / action, field)` pair. Every field in the contract is traceable to a
source artifact.

| Handler / Action | Field | Origin | Confidence |
|---|---|---|---|
| Forwarded message capture | `source_snapshots.chat_id` | data-model.md → `source_snapshots.chat_id` (NOT NULL) | high |
| Forwarded message capture | `source_snapshots.message_id` | data-model.md → `source_snapshots.message_id` (NOT NULL) | high |
| Forwarded message capture | `source_snapshots.chat_username` | data-model.md → `source_snapshots.chat_username` (NULLABLE) | high |
| Forwarded message capture | `source_snapshots.sender_name` | data-model.md → `source_snapshots.sender_name` (NULLABLE) | high |
| Forwarded message capture | `source_snapshots.sender_username` | data-model.md → `source_snapshots.sender_username` (NULLABLE) | high |
| Forwarded message capture | `source_snapshots.message_text` | data-model.md → `source_snapshots.message_text` (NULLABLE) | high |
| Forwarded message capture | `source_snapshots.media_file_id` | data-model.md → `source_snapshots.media_file_id` (NULLABLE) | high |
| Forwarded message capture | `source_snapshots.media_type` | data-model.md → `source_snapshots.media_type` (NULLABLE) | high |
| Forwarded message capture | `source_snapshots.is_media_protected` | data-model.md → `source_snapshots.is_media_protected` (NOT NULL, 0/1) | high |
| Forwarded message capture | `source_snapshots.created_at` | data-model.md → `source_snapshots.created_at` (NOT NULL, UTC ms) | high |
| Forwarded message capture | `reminders.snapshot_id` | data-model.md → `reminders.snapshot_id` (FK) | high |
| Forwarded message capture | `reminders.state = awaiting_time` | data-model.md → `reminders.state` CHECK enum | high |
| Forwarded message capture | `reminders.created_at` | data-model.md → `reminders.created_at` (NOT NULL, UTC ms) | high |
| Quick-pick scheduling | `reminders.state = pending` | data-model.md → `reminders.state` CHECK enum | high |
| Quick-pick scheduling | `reminders.scheduled_at` | data-model.md → `reminders.scheduled_at` (NULLABLE → set here) | high |
| Custom-time text input | `reminders.state = pending` | data-model.md → `reminders.state` CHECK enum | high |
| Custom-time text input | `reminders.scheduled_at` | data-model.md → `reminders.scheduled_at` | high |
| Custom-time text input | Input grammar (relative + structured) | spec.md §8 OQ-1 (resolved) | medium |
| Snooze — resolved guard | `reminders.state` read | data-model.md → `reminders.state` | high |
| Snooze — reschedule | `reminders.state = pending` | data-model.md → `reminders.state` | high |
| Snooze — reschedule | `reminders.scheduled_at` | data-model.md → `reminders.scheduled_at` | high |
| Done | `reminders.state = done` | data-model.md → `reminders.state` CHECK enum | high |
| Done | `reminders.fired_message_id` (for delete/edit) | data-model.md → `reminders.fired_message_id` (NULLABLE → set at fire) | high |
| Done — 48h fallback | Placeholder text `[Нагадування виконано]` | spec.md §5 AC-06 (fallback: edit to placeholder) | medium |
| Delete | `reminders.state = deleted` | data-model.md → `reminders.state` CHECK enum | high |
| Delete | `reminders.fired_message_id` | data-model.md → `reminders.fired_message_id` | high |
| Delete — 48h fallback | Placeholder text `[Нагадування видалено]` | spec.md §5 AC-07 (fallback: edit to placeholder) | medium |
| Go to source | `source_snapshots.chat_username` | data-model.md → `source_snapshots.chat_username` (NULLABLE) | high |
| Go to source | `source_snapshots.message_id` | data-model.md → `source_snapshots.message_id` (NOT NULL) | high |
| Go to source — deep link | `https://t.me/{username}/{id}` format | sad.md §6 Flow 8 + spec.md §5 AC-11 | high |
| Go to source — fallback | Inline content from `source_snapshots.message_text` | spec.md §5 AC-11 fallback | high |
| Scheduler fire | `reminders.state = firing` → `fired` | data-model.md → state machine + ADR-0005 | high |
| Scheduler fire | `reminders.fired_at` | data-model.md → `reminders.fired_at` (NULLABLE → UTC ms at fire) | high |
| Scheduler fire | `reminders.delivered_at` | data-model.md → `reminders.delivered_at` (NULLABLE → UTC ms on ack) | high |
| Scheduler fire | `reminders.fired_message_id` | data-model.md → `reminders.fired_message_id` (NULLABLE → Telegram msg id) | high |
| Scheduler fire — protected content | `source_snapshots.is_media_protected` gate | data-model.md → `source_snapshots.is_media_protected` + spec.md AC-12 | high |
| Scheduler fire — retry | 3× exponential backoff → leave `firing` | sad.md §6 Flow 2, Flow 5 + ADR-0005 | high |
| Expiry | `reminders.state = expired` | data-model.md → `reminders.state` CHECK enum + spec §8 OQ-3 | medium |
| Expiry | 24 h timeout condition | spec.md §8 OQ-3 (resolved) | medium |
| Auth guard | `owner_settings.owner_telegram_id` | data-model.md → `owner_settings.owner_telegram_id` (NOT NULL) | high |
| /settings | `owner_settings.timezone` | data-model.md → `owner_settings.timezone` (NULLABLE → TEXT) | high |
| /settings | IANA timezone validation | inferred from data-model.md description + AC-13 | medium |

---

## Section B — Drift Findings (4-point checklist)

### 1. Handler ↔ data-model *(core)* ✓

Every handler in `cli.md` reads or writes ≥1 entity from `data-model.md`:
- Capture → `source_snapshots` + `reminders`
- Quick-pick / custom-time / snooze reschedule → `reminders.scheduled_at`, `state`
- Done / Delete → `reminders.state` + `reminders.fired_message_id`
- Go to source → `source_snapshots.chat_username`, `message_id`
- Scheduler fire → `reminders` (all fire fields)
- Auth guard → `owner_settings.owner_telegram_id`
- `/settings` → `owner_settings.timezone`

No handler invents a field absent from `data-model.md`. ✓

### 2. Error code ↔ repo error definition *(core)* — conditional ✓

No central error registry exists in the repo yet (greenfield). All 8 internal codes defined in
`cli.md §6` are this contract's **proposal** — they follow the neutral `module.error_name`
snake_case convention (sad.md §8 / spec §8 convention).

> Reconcile when the repo introduces an error-constants module or equivalent. No point failure
> triggered — new project, no pre-existing registry to conflict with.

### 3. Validation ↔ constraint *(core)* ✓

| Constraint checked | Contract value | data-model.md value | Match |
|---|---|---|---|
| `reminders.state` enum | `awaiting_time \| pending \| firing \| fired \| done \| deleted \| expired` | same CHECK enum (data-model.md) | ✓ |
| `owner_settings.id` singleton | Always `id = 1` | `CHECK (id = 1)` | ✓ |
| `reminders.scheduled_at` NULL in awaiting_time | NULL until time set | "NULL while awaiting_time" (data-model.md) | ✓ |
| `source_snapshots.is_media_protected` | `0` or `1` | INTEGER NOT NULL | ✓ |

No conflicts found. Stricter-value rule not triggered. ✓

### 4. Contract ↔ sequence *(supporting)* — ✓ with 2 noted gaps

**Coverage:**

| §6 Flow | Covered in cli.md | Notes |
|---|---|---|
| Flow 1 — capture + quick-pick schedule | §2.1 + §3.1 | ✓ |
| Flow 2 — scheduler fire + at-least-once | §4.1 | ✓ |
| Flow 3 — auth guard (non-Owner / timezone-unset) | §2.1 auth + setup gates | ✓ |
| Flow 4 — custom-time parse + past-time error | §2.2 + §3.2 | ✓ |
| Flow 5 — protected-content fire | §4.1 protected-content path | ✓ |
| Flow 6 — snooze + resolved guard | §3.3–§3.5 | ✓ |
| Flow 7 — Done / Delete + 48h fallback | §3.6–§3.7 | ✓ |
| Flow 8 — Go to source + fallback | §3.8 | ✓ |

**Gaps (upstream — not contract bugs):**

| ID | Gap | Owner | Due |
|---|---|---|---|
| OQ-API-01 | `/settings` command has no §6 flow and no user story in spec.md §4. Behavior (input grammar, Owner-ID bootstrap) is inferred from AC-13 + data-model.md. | specify | before tasks |
| OQ-API-02 | Expiry flow (`awaiting_time → expired` after 24 h) has no §6 sequence (sad.md §6 coverage says "8 US + 13 AC — all covered" but expiry is mentioned only in spec §8 OQ-3 and the state machine). A Flow 9 should be added to sad.md §6. | sequences | before tasks |

Both gaps are **Save-as-OQ with upstream stage as owner** — they are holes in `specify` / `sequences`, not errors in this contract. The contract entries for `/settings` and expiry are marked as `medium` confidence in Section A and will be tightened when the upstream artifacts are updated.

Supporting point: all `alt`-branch pairs from §6 have a corresponding error-code entry in `cli.md §6`. ✓

---

## Summary

| Point | Status |
|---|---|
| 1. Handler ↔ data-model | ✓ |
| 2. Error code ↔ repo | ✓ (conditional — no registry yet) |
| 3. Validation ↔ constraint | ✓ |
| 4. Contract ↔ sequence | ✓ (2 upstream gaps logged as OQ) |

**No core failures. No pause triggered.** Contract is ready to write.

Open questions to resolve before `sdd:tasks`:
- OQ-API-01 — `/settings` specification (owner: specify)
- OQ-API-02 — expiry §6 flow (owner: sequences)
