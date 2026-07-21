# Data-model audit — plain-typed-message-capture — 2026-07-21

## Outcome

**No schema change.** Confirmed by `spec.md` §6.1 ("reuses the existing `messageText` field; no new field or table") and `sad.md` §4 pillar 3 / §2 Technical, both binding constraints. `data-model.md` documents the two existing entities this feature's `sad.md` §6 flows read/write (`source_snapshots`, `reminders`) without altering either.

## Staged migrations

None. Zero `.up.sql` / `.down.sql` pairs written — a legitimate outcome per the data-model skill's protocol (step 9), not a shortfall. `docs/features/plain-typed-message-capture/migrations/` was not created.

## Promote-time convention hint (for future reference — not used this run)

Repo convention: Flyway-style `NN_description.{up,down}.sql` in `migrations/`, tracked in `_migrations`, applied in sorted order (`docs/architecture-map.md` §Conventions, `src/infra/db/migrate.ts:24-42`). Live tree currently ends at `05_add_resolved_at`; next sequential would be `06_*` if a future feature needs one. N/A here — no migration generated.

## Convention deviations

None — this run wrote no SQL, so no convention could deviate.

## Drift detection

Corroborated the documented columns against the live domain + infra layer:

- `src/domain/value-objects/source-snapshot.ts` (`SourceSnapshot` interface) — field-for-field match with `source_snapshots` (`chatId`↔`chat_id`, `messageId`↔`message_id`, `chatUsername`↔`chat_username`, `messageText`↔`message_text`, etc.).
- `src/infra/db/row-mappers.ts` — maps every column 1:1, no unmapped column, no unmapped field.

Result: **no drift** (`field-without-column` / `column-without-field` / `type-mismatch` / `nullability-mismatch` — none found). No `_drift/*.sql` generated.

## Self-check (4 mandatory)

| Check | Result |
|---|---|
| Naming matches repo convention | N/A — no new migration; existing tables already documented follow the repo's `snake_case` / Flyway naming |
| Down reversibility (every CREATE has a DROP, etc.) | N/A — no new migration |
| FK indexes (every `REFERENCES` has a backing index) | PASS — `reminders.snapshot_id → source_snapshots(id)` is already covered by `idx_reminders_snapshot_id` (`migrations/03_create_reminders.up.sql`) |
| Convention adherence | PASS — no deviation; nothing new was written |

## `<!-- TBD -->` markers

None.

## Next stage

Per `.route` = `quick`: `api`'s N/A condition (no contract change — no new/changed endpoint, event, or public signature) is also met here, since capture still dispatches through the existing internal `CaptureMessage` use-case with no new port-level surface. On `quick`, auto-skip `/sdd:api plain-typed-message-capture` with this reason, forwarding directly to `/sdd:tasks plain-typed-message-capture` — ↳ or run `/sdd:api plain-typed-message-capture` explicitly if you want the contract doc regenerated anyway (e.g. to confirm no drift in the OpenAPI spec, if one exists for this bot).
