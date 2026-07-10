# /stats command — design spec

Status: approved
Date: 2026-07-10

## 1. Purpose

Add a `/stats` command to the Telegram bot that gives the Owner an at-a-glance
overview of their reminders: how many are in each meaningful status, how fast
they typically react once a reminder fires, and which active reminders have
been sitting around the longest.

## 2. Scope

In scope:
- New `/stats` command, Owner-only (reuses the existing single-Owner auth gate
  in `src/ports/router.ts`).
- Counts of reminders by status (see §4 for the exact breakdown — not a 1:1
  mirror of the domain's `ReminderState`).
- Average reaction time: time from a reminder firing (`fired_at`) to the
  Owner resolving it (`resolved_at`, new field — see §3).
- Top-5 longest-standing active reminders (ordered by `created_at`, oldest
  first).

Out of scope (deliberately, to keep this focused):
- Time-boxed breakdowns (today/week/month) — only all-time totals.
- Any new UI beyond the single `/stats` reply message (no inline keyboard).
- Multi-user statistics — the bot is single-Owner (`owner_settings` is a
  singleton row); no per-user dimension exists or is needed.

## 3. Data model change

New nullable column on `reminders`:

```sql
ALTER TABLE reminders ADD COLUMN resolved_at INTEGER;
```

Migration: `migrations/05_add_resolved_at.up.sql` / `.down.sql`, following the
existing Flyway-style paired up/down convention.

`resolved_at` is set at the exact moment `Reminder.isResolved()` becomes
`true` — i.e. inside the domain methods that drive a reminder into a
terminal, Owner-caused state:

- `Reminder.resolveDone()` → sets `resolvedAt = Date.now()`
- `Reminder.resolveDelete()` → sets `resolvedAt = Date.now()`
- `Reminder.cancel()` → sets `resolvedAt = Date.now()`

It is **not** set by `Reminder.expire()` (system-driven timeout, not an Owner
action) or `Reminder.snooze()` (returns to `pending`, not a resolution).

### Known dead path: `done`

`resolveDone()` exists in the domain and state machine, but is unreachable in
the current build: `ResolveReminder.execute()` (`src/app/use-cases/resolve-reminder.ts:16-22`)
unconditionally rejects `action: "done"` (ADR-0001), and the fired-reminder
message only ever renders a single "🗑 Delete" button — there is no "✅ Done"
button in the UI (`src/infra/telegram/grammy-telegram-gateway.ts:35-40`).
`resolveDone()` is still wired for domain completeness/symmetry, but the
`done` state will never appear in real data. `/stats` therefore never
surfaces a "done" line (see §4) — showing it would always read `0` and add
no information.

### Two flavors of "deleted"

The domain's `deleted` state is reached via two different events that mean
different things to the Owner:

- `resolve_delete` (`fired → deleted`): the Owner saw a fired reminder and
  dismissed it — this is the resolving action (post-ADR-0001, the sole one).
- `cancel` (`pending → deleted`, from `/list`): the Owner cancelled a
  reminder before it ever fired.

These are distinguished for stats purposes by whether `fired_at` is set,
since a `pending → deleted` transition never went through `firing`.

## 4. Status breakdown shape

Not a direct dump of `ReminderState`. The stats-facing shape:

```ts
interface ReminderStatusCounts {
  awaitingTime: number;        // state = 'awaiting_time'
  pending: number;             // state = 'pending'
  firing: number;              // state = 'firing'
  fired: number;                // state = 'fired'
  closedAfterFiring: number;   // state = 'deleted' AND fired_at IS NOT NULL
  cancelledBeforeFiring: number; // state = 'deleted' AND fired_at IS NULL
  expired: number;             // state = 'expired'
}
```

`done` is omitted entirely (see §3's dead-path note). The domain's
`ReminderState` type itself is untouched — this is purely a stats-layer
reshaping.

## 5. Repository & port

New method on `ReminderRepository` (`src/app/ports/reminder-repository.ts`):

```ts
interface ReminderStats {
  statusCounts: ReminderStatusCounts;
  avgReactionTimeMs: number | null; // null when no fired+resolved rows exist
  longestActive: {
    reminderId: number;
    preview: string;
    ageMs: number;
  }[]; // top-5, oldest created_at first; "active" = state NOT IN ('deleted','expired')
       // (done excluded per §3, but would also match "active" if it ever existed)
}

getStats(): Promise<ReminderStats>;
```

`SqliteReminderRepository.getStats()` implements this with three queries:

1. **Status counts** — one aggregate row via `SUM(CASE WHEN ...)`:
   ```sql
   SELECT
     SUM(CASE WHEN state='awaiting_time' THEN 1 ELSE 0 END) AS awaitingTime,
     SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) AS pending,
     SUM(CASE WHEN state='firing' THEN 1 ELSE 0 END) AS firing,
     SUM(CASE WHEN state='fired' THEN 1 ELSE 0 END) AS fired,
     SUM(CASE WHEN state='deleted' AND fired_at IS NOT NULL THEN 1 ELSE 0 END) AS closedAfterFiring,
     SUM(CASE WHEN state='deleted' AND fired_at IS NULL THEN 1 ELSE 0 END) AS cancelledBeforeFiring,
     SUM(CASE WHEN state='expired' THEN 1 ELSE 0 END) AS expired
   FROM reminders;
   ```
2. **Average reaction time**:
   ```sql
   SELECT AVG(resolved_at - fired_at) AS avgMs
   FROM reminders
   WHERE fired_at IS NOT NULL AND resolved_at IS NOT NULL;
   ```
   `NULL` result (no matching rows) maps to `avgReactionTimeMs: null`.
3. **Longest active** (join to `source_snapshots` for preview text, same join
   shape `findVisibleOrdered` already uses):
   ```sql
   SELECT r.id, r.created_at, s.message_text
   FROM reminders r
   JOIN source_snapshots s ON s.id = r.snapshot_id
   WHERE r.state NOT IN ('deleted', 'expired')
   ORDER BY r.created_at ASC
   LIMIT 5;
   ```
   `preview` is built with the existing `buildPreview()` helper, exported
   from `src/app/use-cases/list-active-reminders.ts` instead of duplicated.
   `ageMs = now - createdAt`, computed in the adapter or use-case (adapter is
   fine — same pattern as other derived fields).

This follows the existing port convention: each repository method serves one
specific caller's need (`findDuePending`, `findVisibleOrdered`, `findFiring`
are all single-purpose), rather than exposing generic granular query
primitives.

## 6. Use-case

`src/app/use-cases/get-stats.ts`:

```ts
export class GetStats {
  constructor(private readonly repo: ReminderRepository) {}
  async execute(): Promise<ReminderStats> {
    return this.repo.getStats();
  }
}
```

Thin pass-through — all computation lives in the repository per §5.

## 7. Handler & wiring

`src/ports/handlers/stats-handler.ts` — formats `ReminderStats` into a
Ukrainian-language reply and calls `ctx.reply`:

```
📊 Статистика нагадувань

За статусами:
• Очікує часу: 2
• Заплановано: 5
• Спрацьовує: 0
• Спрацювало: 1
• Закрито після спрацювання: 10
• Скасовано заздалегідь: 2
• Прострочено: 3

Середній час реакції: 2 год 15 хв

Найдовші активні нагадування:
1. Купити квитки на потяг… — 5 дн 3 год
2. Подзвонити в банк — 2 дн 1 год
```

Edge cases in formatting:
- `avgReactionTimeMs === null` → render `—, немає даних` instead of a
  duration.
- `longestActive` empty → render `Активних нагадувань немає` instead of a
  list.

Wiring, mirroring `/list`:
- `src/ports/router.ts`: `if (msg?.text?.startsWith("/stats")) return handleStats(ctx, repo, statsUC);`
  (constructed alongside the other use-cases in `buildRouter`).
- `src/main.ts`: add `{ command: "stats", description: "Статистика нагадувань" }`
  to the `setMyCommands` call, same Owner-chat scope as `/list`.

## 8. Testing plan

Following the existing Vitest / co-located `__tests__` convention:

- `src/infra/db/__tests__/sqlite-reminder-repository.test.ts` — `getStats()`
  on a tmpdir DB: status counts across all seven states (including both
  `deleted` flavors), average reaction time with and without qualifying rows,
  top-5 longest-active ordering and the 5-row limit.
- `src/domain/__tests__/reminder.test.ts` — `resolveDone()`, `resolveDelete()`,
  `cancel()` set `resolvedAt`; `expire()` and `snooze()` do not.
- `src/app/use-cases/__tests__/get-stats.test.ts` — pass-through behavior
  against a mock repository.
- `src/ports/handlers/__tests__/stats-handler.test.ts` — message formatting:
  normal data, `avgReactionTimeMs: null`, empty `longestActive`.
- Migration round-trip: `up` then `down` leaves schema as before (matching
  whatever check the existing migration test harness runs, if any — confirm
  during implementation).

## 9. Non-goals / explicitly deferred

- Time-windowed stats (today/week/month) — deferred; all-time totals only.
- Any stats beyond the four requested: status counts, average reaction time,
  top-5 longest active. No additional metrics were requested and none are
  added speculatively (YAGNI).
