## Summary

Додає команду `/list` та дві inline-дії (скасувати / до джерела) до бота нагадувань.
Власник отримує одне повідомлення зі списком усіх `pending`-нагадувань, впорядкованих за часом спрацьовування; скасування переводить нагадування у `deleted` до того, як воно спрацює.
Детально: [`spec.md`](docs/features/list-active-reminders/spec.md).

## Acceptance criteria

- AC-01 — `/list` повертає всі `pending`-нагадування, впорядковані за часом (тай-брейк — порядок додавання), з preview (~100 символів) та часом у домашньому TZ ✓
- AC-02 — порожній список → одне чітке повідомлення «немає активних нагадувань» ✓
- AC-03 — скасування переводить нагадування у `deleted`, підтверджує окремим повідомленням, список залишається незмінним ✓
- AC-04 — натиск на вже неактивне нагадування (будь-який non-`pending` стан, включно з `firing`) → однакове повідомлення «більше не активне», без крашу, без подвійної дії ✓
- AC-05 — не-власник не отримує жодних нагадувань і жодна дія не виконується ✓
- AC-06 — «до джерела» без публічного username → inline зміст; з username → deep link ✓
- AC-07 — набрати `/list` і вибрати з меню → однаковий результат ✓
- AC-08 — при переповненні — рівно одне повідомлення з найближчими нагадуваннями + «… ще M» ✓

## Design

- Spec: `docs/features/list-active-reminders/spec.md`
- Architecture: `docs/features/list-active-reminders/sad.md`
- Decisions: `docs/features/list-active-reminders/adr/` (ADR-0001, ADR-0002, ADR-0003 — всі Accepted)
- Data model: немає змін схеми — читає `reminders` + `source_snapshots` через `idx_reminders_state_scheduled_at`
- API: немає зовнішнього API; Telegram inline-keyboard `callback_data` кодується як `cancel:<id>` / `source:<id>` (≤ 64 bytes)

## Tasks (SDD-Task trailers)

| Task | Опис | Коміт |
|---|---|---|
| T1 | `pending→deleted` cancel transition (domain) | b8580aa |
| T2 | `findActivePendingOrdered` на repo port | 10fdea5 |
| T3 | SQLite impl `findActivePendingOrdered` | 9d4ec69 |
| T4 | `ListActiveReminders` use-case (truncation + overflow) | c0a3381 |
| T5 | `CancelPendingReminder` use-case | 52c3082 |
| T6 | `/list` command handler (render + auth gate + timing log) | 5e2b37e + 35278bf + 24c9687 |
| T7 | cancel + go-to-source callbacks; not-found → no-op | 87bf27c + 3c34f95 |
| T8 | wiring: router, DI, command menu | 35278bf |
| fix | map not-found cancel to uniform no-op (AC-04) | 3c34f95 |
| test | real-SQLite integration tier (AC-03/04/06) | 11f5dc6 |
| test | assert cancel path never edits the list message (AC-03/ADR-0002) | d9838c0 |

## Verification

- **Unit:** 158/158 passed, `tsc --noEmit` clean (exit 0) — re-run на поточний HEAD.
- **Integration:** real ephemeral `:memory:` SQLite — cancel-persist (AC-03/AC-04), go-to-source JOIN (AC-06), `idx_reminders_state_scheduled_at` via EXPLAIN QUERY PLAN — всі зелені.
- **Lint + vet:** TypeScript 5.4 strict mode — чистий.
- **Spot-check AC (верифіковано через integration tests, бот не запускався — немає Telegram-токена в середовищі):**
  - **AC-01** (`list-integration.test.ts`, `active-pending-ordering.test.ts`) — 3 `pending`-рядки з різним `scheduled_at` → реальна SQLite повертає їх у правильному порядку (soonest first, тай-брейк за `id`); preview обрізається до першого рядка ~100 символів; час рендериться у домашньому TZ власника. Спостережено: ✓.
  - **AC-03** (`list-integration.test.ts:68`) — real-SQLite: `pending`→`deleted` зберігається; confirm надсилається окремим повідомленням; `editMessageText` не викликається. Спостережено: ✓.
  - **AC-08** (`list-handler.test.ts:83`) — набір > MAX_ACTIVE_LIST_ROWS → `sendMessage` викликається рівно 1 раз, текст завершується «… ще M». Спостережено: ✓.
  - Запуск реального бота через Telegram API відкладено через відсутність токена в середовищі (CI/CD).

## Operational notes

- Migration: **немає** — схема не змінюється, нових таблиць/колонок немає.
- Feature flag / config: немає.
- Rollback: revert PR + перезапустити бота; стан БД чистий.

---

**Review:** `docs/features/list-active-reminders/_review/review-2026-06-15.md` — **PASS** (re-review після 4 fix-now знахідок).
**Changelog:** `docs/features/list-active-reminders/changelog.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
