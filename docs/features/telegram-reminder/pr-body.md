## Summary

Introduces a personal Telegram reminder bot (T01–T17) that captures forwarded messages, schedules them via quick-pick or custom time, fires them back at the right moment with inline action buttons, and deletes resolved reminders from the chat — so an empty bot chat is a fully cleared inbox. See [spec](docs/features/telegram-reminder/spec.md).

## Acceptance criteria

- AC-01 — forwarded message → bot asks "When to remind?" with quick-pick + Custom time buttons ✓
- AC-02 — quick-pick tap → reminder confirmed in plain language, enters pending state ✓
- AC-03 — custom time (valid future) → reminder confirmed and scheduled ✓
- AC-04 — due pending reminder → bot sends original content + Snooze / Done / Delete / Go to source ✓
- AC-05 — Snooze → new time set (past-today quick-picks hidden), original message edited to rescheduled state ✓
- AC-06 — Done → fired-reminder message deleted (or edited to placeholder if outside Telegram delete window) ✓
- AC-07 — Delete → fired-reminder message removed without marking done ✓
- AC-08 — custom time in the past → bot blocks + explains, leaves prompt open for retry ✓
- AC-09 — non-Owner message → silently ignored, no data stored, no reply ✓
- AC-10 — snooze on already-resolved reminder → bot explains already resolved, no action ✓
- AC-11 — "Go to source" with no navigable deep link → bot notes unavailability + shows inline content ✓
- AC-12 — protected-content media → reminder fires with text + restriction note + all buttons ✓
- AC-13 — forward before timezone set → bot asks for timezone via /settings, resumes capture after ✓

## Design

- Spec: `docs/features/telegram-reminder/spec.md`
- Architecture: `docs/features/telegram-reminder/sad.md`
- Decisions: `docs/features/telegram-reminder/adr/` (ADR-0001 through ADR-0006)
- Data model + migrations: `docs/features/telegram-reminder/data-model.md` / `docs/features/telegram-reminder/migrations/`
- Contracts: `docs/features/telegram-reminder/contracts/`

## Tasks (SDD commits)

| Task | Commit | Description |
|------|--------|-------------|
| T01 | `67680e7` | Bootstrap project scaffold |
| T02 | `55ad537` | Promote migrations + migration runner |
| T03 | `8ec698e` | Reminder entity + state machine + value objects + errors |
| T04 | `98eeb92` | Port interfaces ReminderRepository + TelegramGateway |
| T05 | `186e3f1` | Use cases CaptureMessage + ScheduleReminder |
| T06 | `29f043e` | Use cases FireDueReminders + ExpireStalePrompts |
| T07 | `596961e` | Use cases SnoozeReminder + ResolveReminder |
| T08 | `11c1f4e` | SqliteReminderRepository + test factories |
| T09 | `ef74f64` | GrammyTelegramGateway |
| T10 | `11b8ea6` | Capture conversation + /settings handler + router |
| T11 | `71a8a90` | Callback handlers: snooze, done, delete, go-to-source |
| T12 | `cae1277` | In-process polling-tick scheduler |
| T13 | `a8ed3b3` | Composition root main.ts + openDb |
| T14 | `15d5eca` | Integration tests: durability + fire accuracy + E2E |
| T15 | `802f026` | Fix router callback parsing + quick-pick timezone math + snooze_pick routing + snooze edit message |
| T16 | `a8cccf8` | Custom-time conversation tests — AC-03/AC-08 coverage |
| T17 | `0feaa6c` | Auth-gate callbacks + timezone null init + AC-12 test + honest durability tests |
| — | `d49eeef` | Tracker: mark T15/T16/T17 done; follow-up tasks from review |

## Verification

- **TypeScript:** `npx tsc --noEmit` → clean (0 errors)
- **Tests:** `npx vitest run` → 24 test files, **99/99 tests passing** (4.96 s)
- **Gate re-run:** confirmed green on 2026-06-13 immediately before ship
- **Live Telegram run — DEFERRED:** the bot requires a live `BOT_TOKEN` and a configured Telegram account which are not available in the CI/build environment. The following AC outcomes were verified via asserting tests instead of live observation:
  - AC-01: `capture-conversation.test.ts` asserts the bot replies with "When to remind?" + button row on a forwarded message.
  - AC-04: `fire-due-reminders.test.ts` + E2E `test/integration/fire-accuracy.test.ts` assert the reminder fires within ±60 s and the gateway receives the correct content + 4 inline buttons.
  - AC-09: `router-auth.test.ts` asserts non-Owner `chat_id` produces zero gateway calls and zero repository writes.
- **Review verdict:** PASS (`docs/features/telegram-reminder/_review/review-2026-06-13b.md`) — all 8 prior CRITICAL/MAJOR findings resolved; all 13 ACs trace to code + asserting test.

## Operational notes

- **Migrations:** 3 SQLite migrations applied automatically at startup (`src/infra/db/migrate.ts`). Run on deploy; roll back with `migrate down` + revert deploy.
- **Required env vars:** `BOT_TOKEN`, `OWNER_CHAT_ID`. Optional: `DB_PATH` (default `./data/reminders.db`).
- **Feature flag:** none.
- **Deferred before next release:** S2-4 (dead `messageId !== null` guard in `source-snapshot.ts`) and S2-5 (raw `new Error` in use-case not-found paths) — tracked in spec §8.
