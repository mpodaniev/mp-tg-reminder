# /stats Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Owner-only `/stats` Telegram command that reports reminder counts by status, average reaction time (fired → resolved), and the 5 longest-standing active reminders.

**Architecture:** Hexagonal, following the repo's existing layering. A new `getStats()` method on the `ReminderRepository` port computes the aggregates in SQL (SQLite adapter) / in-memory (test double). A thin `GetStats` use-case in `app` converts raw entries into Owner-facing previews. A new `stats-handler.ts` in `ports` formats the Ukrainian-language reply and is wired into `router.ts` exactly like `/list`.

**Tech Stack:** TypeScript 5.4 (NodeNext/ES2022), `better-sqlite3`, `grammy`, Vitest.

## Global Constraints

- All user-facing text is Ukrainian (matches every existing bot message).
- Do not add any new npm dependency — everything needed already exists (`better-sqlite3`, `grammy`, `vitest`).
- Node >=22, ESM (`NodeNext`) — every relative import in `.ts` source uses a `.js` extension.
- Migrations are Flyway-style paired `NN_description.{up,down}.sql` files under `migrations/`, tracked via `src/infra/db/migrate.ts`.
- Tests are Vitest, co-located under `__tests__/`, following the file's existing describe/it style — do not introduce a new test framework or pattern.
- Repository port methods are single-purpose (mirrors `findDuePending`, `findVisibleOrdered`, `findFiring`) — `getStats()` is one method serving the `/stats` command, not a set of generic query primitives.
- Design source of truth: `docs/superpowers/specs/2026-07-10-reminder-stats-design.md`.

---

## Task 1: Migration — add `resolved_at` column

**Files:**
- Create: `migrations/05_add_resolved_at.up.sql`
- Create: `migrations/05_add_resolved_at.down.sql`
- Modify: `src/infra/__tests__/migrate.test.ts`

**Interfaces:**
- Produces: a nullable `reminders.resolved_at INTEGER` column, applied via the existing `runMigrationsUp`/`runMigrationsDown` (`src/infra/db/migrate.ts`) — no code changes needed there, it auto-discovers `*.up.sql`/`*.down.sql` by filename sort order.

- [ ] **Step 1: Write the failing test**

In `src/infra/__tests__/migrate.test.ts`, change the first test's title (it will apply 5, not 4, up-migrations once Step 3 adds the new migration file — purely descriptive, no assertion change needed since it only checks table names):

```ts
  it("applies all 5 up-migrations cleanly", () => {
```

Add a new test at the end of the `describe("migration runner", ...)` block, after the existing `"re-applies after rollback"` test:

```ts
  it("resolved_at column exists on reminders after migrations are applied", () => {
    const cols = (
      db.prepare("PRAGMA table_info(reminders)").all() as { name: string }[]
    ).map((c) => c.name);
    expect(cols).toContain("resolved_at");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/infra/__tests__/migrate.test.ts`
Expected: FAIL — `resolved_at column exists on reminders after migrations are applied` fails because no `05_*` migration exists yet, so `reminders` has no `resolved_at` column.

- [ ] **Step 3: Write the up/down migration files**

`migrations/05_add_resolved_at.up.sql`:
```sql
-- resolved_at: set the moment a reminder reaches a terminal, Owner-caused
-- state (Reminder.resolveDone/resolveDelete/cancel — see reminder.ts). Used to
-- compute the /stats average-reaction-time metric as resolved_at - fired_at.
-- NULL for rows not yet resolved and for the system-driven awaiting_time →
-- expired path, which is not an Owner action.
ALTER TABLE reminders ADD COLUMN resolved_at INTEGER;
```

`migrations/05_add_resolved_at.down.sql`:
```sql
ALTER TABLE reminders DROP COLUMN resolved_at;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/infra/__tests__/migrate.test.ts`
Expected: PASS (5 up-files discovered, rollback drops the column then the table, re-apply restores both)

- [ ] **Step 5: Commit**

```bash
git add migrations/05_add_resolved_at.up.sql migrations/05_add_resolved_at.down.sql src/infra/__tests__/migrate.test.ts
git commit -m "feat: add resolved_at column migration"
```

---

## Task 2: Domain — `Reminder.resolvedAt`

**Files:**
- Modify: `src/domain/reminder.ts`
- Modify: `src/domain/__tests__/reminder.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Reminder.resolvedAt: number | null` getter; `ReminderProps.resolvedAt?: number | null` (optional, for `reconstitute`); `resolveDone()`, `resolveDelete()`, `cancel()` now set `resolvedAt` as a side effect. Later tasks (3, 4) read `reminder.resolvedAt` to persist it.

- [ ] **Step 1: Write the failing tests**

Add to `src/domain/__tests__/reminder.test.ts` (inside `describe("Reminder entity", ...)`, after the existing `"cancel transitions..."` test):

```ts
  it("resolveDelete sets resolvedAt (fired → deleted)", () => {
    const r = Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(), state: "fired" });
    expect(r.resolvedAt).toBeNull();
    r.resolveDelete();
    expect(r.state).toBe("deleted");
    expect(r.resolvedAt).not.toBeNull();
  });

  it("resolveDone sets resolvedAt (fired → done)", () => {
    const r = Reminder.reconstitute({ id: 1, snapshot: makeSnapshot(), state: "fired" });
    r.resolveDone();
    expect(r.state).toBe("done");
    expect(r.resolvedAt).not.toBeNull();
  });

  it("cancel sets resolvedAt (pending → deleted)", () => {
    const r = Reminder.create({ snapshot: makeSnapshot() });
    r.schedule(ScheduledTime.from(Date.now() + 60_000));
    expect(r.resolvedAt).toBeNull();
    r.cancel();
    expect(r.resolvedAt).not.toBeNull();
  });

  it("expire does not set resolvedAt — system-driven, not an Owner action", () => {
    const r = Reminder.create({ snapshot: makeSnapshot() });
    r.expire();
    expect(r.resolvedAt).toBeNull();
  });

  it("snooze does not set resolvedAt — returns to pending, not a resolution", () => {
    const r = Reminder.create({ snapshot: makeSnapshot() });
    r.schedule(ScheduledTime.from(Date.now() + 60_000));
    r.startFiring();
    r.markFired(42);
    r.snooze(ScheduledTime.from(Date.now() + 120_000));
    expect(r.resolvedAt).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/__tests__/reminder.test.ts`
Expected: FAIL — `r.resolvedAt` is `undefined` (property doesn't exist on `Reminder` yet), so `toBeNull()` assertions fail.

- [ ] **Step 3: Implement `resolvedAt` on `Reminder`**

In `src/domain/reminder.ts`, update `ReminderProps`:

```ts
export interface ReminderProps {
  id?: number;
  snapshot: SourceSnapshot;
  state?: ReminderState;
  scheduledAt?: number | null;
  firedAt?: number | null;
  deliveredAt?: number | null;
  firedMessageId?: number | null;
  createdAt?: number;
  resolvedAt?: number | null;
}
```

Add the private field, constructor init, and getter to the `Reminder` class:

```ts
  private _resolvedAt: number | null;
```

In the constructor, after `this._firedMessageId = props.firedMessageId ?? null;`:

```ts
    this._resolvedAt = props.resolvedAt ?? null;
```

Add the getter, after `get firedMessageId()`:

```ts
  get resolvedAt(): number | null {
    return this._resolvedAt;
  }
```

Update the three terminal-transition methods:

```ts
  resolveDone(): void {
    this._state = transition(this._state, "resolve_done");
    this._resolvedAt = Date.now();
  }

  resolveDelete(): void {
    this._state = transition(this._state, "resolve_delete");
    this._resolvedAt = Date.now();
  }

  cancel(): void {
    this._state = transition(this._state, "cancel");
    this._resolvedAt = Date.now();
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/domain/__tests__/reminder.test.ts`
Expected: PASS (all tests, including the 5 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/domain/reminder.ts src/domain/__tests__/reminder.test.ts
git commit -m "feat: track resolvedAt on Reminder for done/delete/cancel"
```

---

## Task 3: Persist `resolved_at` through the repository

**Files:**
- Modify: `src/infra/db/row-mappers.ts`
- Modify: `src/infra/db/sqlite-reminder-repository.ts`
- Modify: `src/app/use-cases/__tests__/helpers/in-memory-repo.ts`
- Modify: `src/infra/__tests__/sqlite-reminder-repository.test.ts`

**Interfaces:**
- Consumes: `Reminder.resolvedAt` (Task 2).
- Produces: `resolved_at` is now read/written on every `saveWithSnapshot`, `update`, and every `find*` call (via `rowToReminder`) in both the SQLite adapter and the in-memory test double — so `reminder.resolvedAt` round-trips through persistence for all later tasks.

- [ ] **Step 1: Write the failing test**

Add to `src/infra/__tests__/sqlite-reminder-repository.test.ts`, inside `describe("SqliteReminderRepository", ...)`, after the existing `"update persists state change"` test:

```ts
  it("update persists resolvedAt", async () => {
    const snapshotData = {
      chatId: 104,
      messageId: 204,
      chatUsername: null,
      senderName: null,
      senderUsername: null,
      messageText: "resolve me",
      mediaFileId: null,
      mediaType: null,
      isMediaProtected: false,
      createdAt: Date.now(),
    };
    const r = Reminder.create({ snapshot: { ...snapshotData, id: 0 } });
    const saved = await repo.saveWithSnapshot(snapshotData, r);

    db.prepare("UPDATE reminders SET state='fired', fired_at=? WHERE id=?")
      .run(Date.now() - 1000, saved.id);

    const reloaded = await repo.findById(saved.id!);
    reloaded!.resolveDelete();
    await repo.update(reloaded!);

    const updated = await repo.findById(saved.id!);
    expect(updated!.state).toBe("deleted");
    expect(updated!.resolvedAt).not.toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/infra/__tests__/sqlite-reminder-repository.test.ts`
Expected: FAIL — `updated!.resolvedAt` is `null` because `update()` doesn't persist it yet.

- [ ] **Step 3: Implement persistence**

In `src/infra/db/row-mappers.ts`, add `resolved_at` to `ReminderDbRow`:

```ts
export interface ReminderDbRow {
  id: number;
  snapshot_id: number;
  state: string;
  scheduled_at: number | null;
  fired_at: number | null;
  delivered_at: number | null;
  fired_message_id: number | null;
  created_at: number;
  resolved_at: number | null;
}
```

Update `rowToReminder` to pass it through:

```ts
export function rowToReminder(
  row: ReminderDbRow,
  snapshot: SourceSnapshot
): Reminder {
  return Reminder.reconstitute({
    id: row.id,
    snapshot,
    state: row.state as any,
    scheduledAt: row.scheduled_at,
    firedAt: row.fired_at,
    deliveredAt: row.delivered_at,
    firedMessageId: row.fired_message_id,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  });
}
```

In `src/infra/db/sqlite-reminder-repository.ts`, update the `saveWithSnapshot` INSERT to include `resolved_at` (always `NULL` at creation, since a brand-new `Reminder` starts in `awaiting_time`):

```ts
      const reminderResult = this.db
        .prepare(
          `INSERT INTO reminders
           (snapshot_id, state, scheduled_at, fired_at, delivered_at, fired_message_id, created_at, resolved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          snapshotId,
          reminder.state,
          reminder.scheduledAt,
          reminder.firedAt,
          reminder.deliveredAt,
          reminder.firedMessageId,
          reminder.createdAt,
          reminder.resolvedAt
        );
```

Update `update()`:

```ts
  async update(reminder: Reminder): Promise<void> {
    this.db
      .prepare(
        `UPDATE reminders
         SET state = ?, scheduled_at = ?, fired_at = ?, delivered_at = ?, fired_message_id = ?, resolved_at = ?
         WHERE id = ?`
      )
      .run(
        reminder.state,
        reminder.scheduledAt,
        reminder.firedAt,
        reminder.deliveredAt,
        reminder.firedMessageId,
        reminder.resolvedAt,
        reminder.id
      );
  }
```

In `src/app/use-cases/__tests__/helpers/in-memory-repo.ts`, update `saveWithSnapshot`'s `Reminder.reconstitute` call to pass `resolvedAt` through (parity with the SQLite adapter — `update()` already stores the whole `Reminder` object as-is, so it needs no change):

```ts
    const saved = Reminder.reconstitute({
      id,
      snapshot: snapshotWithId,
      state: reminder.state,
      scheduledAt: reminder.scheduledAt,
      firedAt: reminder.firedAt,
      deliveredAt: reminder.deliveredAt,
      firedMessageId: reminder.firedMessageId,
      createdAt: reminder.createdAt,
      resolvedAt: reminder.resolvedAt,
    });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/infra/__tests__/sqlite-reminder-repository.test.ts`
Expected: PASS (all tests, including the new one)

Then run the full suite to confirm nothing else broke:

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infra/db/row-mappers.ts src/infra/db/sqlite-reminder-repository.ts src/app/use-cases/__tests__/helpers/in-memory-repo.ts src/infra/__tests__/sqlite-reminder-repository.test.ts
git commit -m "feat: persist resolvedAt through the reminder repository"
```

---

## Task 4: `ReminderRepository.getStats()`

**Files:**
- Modify: `src/app/ports/reminder-repository.ts`
- Modify: `src/infra/db/sqlite-reminder-repository.ts`
- Modify: `src/app/use-cases/__tests__/helpers/in-memory-repo.ts`
- Modify: `src/infra/__tests__/sqlite-reminder-repository.test.ts`

**Interfaces:**
- Consumes: `Reminder.resolvedAt`/`firedAt`/`createdAt` (Tasks 2–3); `reminders` table now has `resolved_at` (Task 1).
- Produces:
  ```ts
  export interface ReminderStatusCounts {
    awaitingTime: number;
    pending: number;
    firing: number;
    fired: number;
    closedAfterFiring: number;
    cancelledBeforeFiring: number;
    expired: number;
  }
  export interface LongestActiveEntry {
    reminderId: number;
    messageText: string | null;
    ageMs: number;
  }
  export interface ReminderStats {
    statusCounts: ReminderStatusCounts;
    avgReactionTimeMs: number | null;
    longestActive: LongestActiveEntry[];
  }
  ```
  and `ReminderRepository.getStats(): Promise<ReminderStats>`. Task 6's `GetStats` use-case consumes this directly.

- [ ] **Step 1: Write the failing tests**

Add to `src/infra/__tests__/sqlite-reminder-repository.test.ts`, as a new top-level `describe` block after `describe("SqliteReminderRepository.findVisibleOrdered ...)`:

```ts
describe("SqliteReminderRepository.getStats", () => {
  let memDb: Database.Database;
  let memRepo: SqliteReminderRepository;

  function seed(opts: {
    state: string;
    createdAt: number;
    firedAt?: number | null;
    resolvedAt?: number | null;
    messageText?: string | null;
  }): number {
    const snapId = memDb
      .prepare(
        `INSERT INTO source_snapshots
         (chat_id, message_id, chat_username, sender_name, sender_username,
          message_text, media_file_id, media_type, is_media_protected, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(100, 200, null, null, null, opts.messageText ?? "text", null, null, 0, opts.createdAt)
      .lastInsertRowid as number;
    return memDb
      .prepare(
        `INSERT INTO reminders (snapshot_id, state, scheduled_at, fired_at, delivered_at, fired_message_id, created_at, resolved_at)
         VALUES (?, ?, NULL, ?, NULL, NULL, ?, ?)`
      )
      .run(snapId, opts.state, opts.firedAt ?? null, opts.createdAt, opts.resolvedAt ?? null)
      .lastInsertRowid as number;
  }

  beforeEach(() => {
    memDb = new Database(":memory:");
    memDb.pragma("foreign_keys = ON");
    runMigrationsUp(memDb);
    memRepo = new SqliteReminderRepository(memDb);
  });

  afterEach(() => memDb.close());

  it("returns all-zero counts, null average, and an empty list on an empty database", async () => {
    const stats = await memRepo.getStats();
    expect(stats.statusCounts).toEqual({
      awaitingTime: 0,
      pending: 0,
      firing: 0,
      fired: 0,
      closedAfterFiring: 0,
      cancelledBeforeFiring: 0,
      expired: 0,
    });
    expect(stats.avgReactionTimeMs).toBeNull();
    expect(stats.longestActive).toEqual([]);
  });

  it("counts each status, splitting deleted by whether fired_at is set", async () => {
    seed({ state: "awaiting_time", createdAt: 1000 });
    seed({ state: "pending", createdAt: 1000 });
    seed({ state: "firing", createdAt: 1000 });
    seed({ state: "fired", createdAt: 1000, firedAt: 1000 });
    seed({ state: "deleted", createdAt: 1000, firedAt: 1000, resolvedAt: 2000 });
    seed({ state: "deleted", createdAt: 1000 });
    seed({ state: "expired", createdAt: 1000 });

    const stats = await memRepo.getStats();

    expect(stats.statusCounts).toEqual({
      awaitingTime: 1,
      pending: 1,
      firing: 1,
      fired: 1,
      closedAfterFiring: 1,
      cancelledBeforeFiring: 1,
      expired: 1,
    });
  });

  it("averages reaction time only across rows with both fired_at and resolved_at", async () => {
    seed({ state: "deleted", createdAt: 1000, firedAt: 1000, resolvedAt: 3000 }); // 2000ms
    seed({ state: "deleted", createdAt: 1000, firedAt: 1000, resolvedAt: 5000 }); // 4000ms
    seed({ state: "deleted", createdAt: 1000 }); // excluded — no fired_at/resolved_at

    const stats = await memRepo.getStats();

    expect(stats.avgReactionTimeMs).toBe(3000);
  });

  it("returns the 5 oldest active reminders by created_at, excluding deleted/expired", async () => {
    for (let i = 1; i <= 6; i++) {
      seed({ state: "pending", createdAt: i * 1000, messageText: `r${i}` });
    }
    seed({ state: "deleted", createdAt: 1, messageText: "should not appear" });
    seed({ state: "expired", createdAt: 1, messageText: "should not appear either" });

    const stats = await memRepo.getStats();

    expect(stats.longestActive).toHaveLength(5);
    expect(stats.longestActive.map((x) => x.messageText)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
    expect(stats.longestActive[0]!.ageMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/infra/__tests__/sqlite-reminder-repository.test.ts`
Expected: FAIL — `memRepo.getStats is not a function`

- [ ] **Step 3: Implement `getStats()`**

In `src/app/ports/reminder-repository.ts`, add the new types and method:

```ts
export interface ReminderStatusCounts {
  awaitingTime: number;
  pending: number;
  firing: number;
  fired: number;
  closedAfterFiring: number;
  cancelledBeforeFiring: number;
  expired: number;
}

export interface LongestActiveEntry {
  reminderId: number;
  messageText: string | null;
  ageMs: number;
}

export interface ReminderStats {
  statusCounts: ReminderStatusCounts;
  avgReactionTimeMs: number | null;
  longestActive: LongestActiveEntry[];
}

export interface ReminderRepository {
  saveWithSnapshot(
    snapshot: Omit<SourceSnapshot, "id">,
    reminder: Reminder
  ): Promise<Reminder>;

  findById(id: number): Promise<Reminder | null>;

  findDuePending(nowMs: number): Promise<Reminder[]>;

  findVisibleOrdered(): Promise<Reminder[]>;

  findFiring(): Promise<Reminder[]>;

  findAwaitingOlderThan(cutoffMs: number): Promise<Reminder[]>;

  update(reminder: Reminder): Promise<void>;

  getOwnerSettings(): Promise<OwnerSettingsRow | null>;

  upsertOwnerSettings(
    ownerTelegramId: number,
    timezone: string | null
  ): Promise<void>;

  /**
   * Aggregate view backing /stats: status counts, average fired→resolved
   * reaction time, and the 5 oldest still-active reminders.
   */
  getStats(): Promise<ReminderStats>;
}
```

In `src/infra/db/sqlite-reminder-repository.ts`, add the import and method:

```ts
import type {
  ReminderRepository,
  OwnerSettingsRow,
  ReminderStats,
} from "../../app/ports/reminder-repository.js";
```

```ts
  async getStats(): Promise<ReminderStats> {
    const counts = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN state='awaiting_time' THEN 1 ELSE 0 END) AS awaitingTime,
           SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN state='firing' THEN 1 ELSE 0 END) AS firing,
           SUM(CASE WHEN state='fired' THEN 1 ELSE 0 END) AS fired,
           SUM(CASE WHEN state='deleted' AND fired_at IS NOT NULL THEN 1 ELSE 0 END) AS closedAfterFiring,
           SUM(CASE WHEN state='deleted' AND fired_at IS NULL THEN 1 ELSE 0 END) AS cancelledBeforeFiring,
           SUM(CASE WHEN state='expired' THEN 1 ELSE 0 END) AS expired
         FROM reminders`
      )
      .get() as Record<
      "awaitingTime" | "pending" | "firing" | "fired" | "closedAfterFiring" | "cancelledBeforeFiring" | "expired",
      number | null
    >;

    const avgRow = this.db
      .prepare(
        `SELECT AVG(resolved_at - fired_at) AS avgMs
         FROM reminders
         WHERE fired_at IS NOT NULL AND resolved_at IS NOT NULL`
      )
      .get() as { avgMs: number | null };

    const now = Date.now();
    const longestRows = this.db
      .prepare(
        `SELECT r.id AS reminderId, r.created_at AS createdAt, s.message_text AS messageText
         FROM reminders r
         JOIN source_snapshots s ON s.id = r.snapshot_id
         WHERE r.state NOT IN ('deleted', 'expired')
         ORDER BY r.created_at ASC
         LIMIT 5`
      )
      .all() as { reminderId: number; createdAt: number; messageText: string | null }[];

    return {
      statusCounts: {
        awaitingTime: counts.awaitingTime ?? 0,
        pending: counts.pending ?? 0,
        firing: counts.firing ?? 0,
        fired: counts.fired ?? 0,
        closedAfterFiring: counts.closedAfterFiring ?? 0,
        cancelledBeforeFiring: counts.cancelledBeforeFiring ?? 0,
        expired: counts.expired ?? 0,
      },
      avgReactionTimeMs: avgRow.avgMs ?? null,
      longestActive: longestRows.map((row) => ({
        reminderId: row.reminderId,
        messageText: row.messageText,
        ageMs: now - row.createdAt,
      })),
    };
  }
```

In `src/app/use-cases/__tests__/helpers/in-memory-repo.ts`, add the import and method so the test double keeps implementing the full interface:

```ts
import type {
  ReminderRepository,
  OwnerSettingsRow,
  ReminderStats,
  ReminderStatusCounts,
} from "../../../ports/index.js";
```

```ts
  async getStats(): Promise<ReminderStats> {
    const all = [...this.reminders.values()];
    const statusCounts: ReminderStatusCounts = {
      awaitingTime: 0,
      pending: 0,
      firing: 0,
      fired: 0,
      closedAfterFiring: 0,
      cancelledBeforeFiring: 0,
      expired: 0,
    };
    for (const r of all) {
      if (r.state === "awaiting_time") statusCounts.awaitingTime++;
      else if (r.state === "pending") statusCounts.pending++;
      else if (r.state === "firing") statusCounts.firing++;
      else if (r.state === "fired") statusCounts.fired++;
      else if (r.state === "deleted") {
        if (r.firedAt !== null) statusCounts.closedAfterFiring++;
        else statusCounts.cancelledBeforeFiring++;
      } else if (r.state === "expired") statusCounts.expired++;
    }

    const resolvedDurations = all
      .filter((r) => r.firedAt !== null && r.resolvedAt !== null)
      .map((r) => r.resolvedAt! - r.firedAt!);
    const avgReactionTimeMs =
      resolvedDurations.length === 0
        ? null
        : resolvedDurations.reduce((sum, ms) => sum + ms, 0) / resolvedDurations.length;

    const now = Date.now();
    const longestActive = all
      .filter((r) => r.state !== "deleted" && r.state !== "expired")
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 5)
      .map((r) => ({
        reminderId: r.id!,
        messageText: r.snapshot.messageText,
        ageMs: now - r.createdAt,
      }));

    return { statusCounts, avgReactionTimeMs, longestActive };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/infra/__tests__/sqlite-reminder-repository.test.ts`
Expected: PASS

Then run the full suite and the build (the interface change must not break any other implementer):

Run: `npx vitest run`
Expected: PASS

Run: `npm run build`
Expected: exits 0, no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add src/app/ports/reminder-repository.ts src/infra/db/sqlite-reminder-repository.ts src/app/use-cases/__tests__/helpers/in-memory-repo.ts src/infra/__tests__/sqlite-reminder-repository.test.ts
git commit -m "feat: add ReminderRepository.getStats()"
```

---

## Task 5: `GetStats` use-case

**Files:**
- Modify: `src/app/use-cases/list-active-reminders.ts` (export `buildPreview`)
- Create: `src/app/use-cases/get-stats.ts`
- Create: `src/app/use-cases/__tests__/get-stats.test.ts`

**Interfaces:**
- Consumes: `ReminderRepository.getStats()` (Task 4); `buildPreview(text: string | null): string` from `list-active-reminders.ts`.
- Produces:
  ```ts
  export interface StatsLongestActiveEntry {
    reminderId: number;
    preview: string;
    ageMs: number;
  }
  export interface StatsSummary {
    statusCounts: ReminderStatusCounts;
    avgReactionTimeMs: number | null;
    longestActive: StatsLongestActiveEntry[];
  }
  export class GetStats {
    constructor(repo: ReminderRepository);
    execute(): Promise<StatsSummary>;
  }
  ```
  Task 6's `stats-handler.ts` consumes `StatsSummary` and `GetStats`.

- [ ] **Step 1: Export `buildPreview`**

In `src/app/use-cases/list-active-reminders.ts`, change:

```ts
function buildPreview(text: string | null): string {
```

to:

```ts
export function buildPreview(text: string | null): string {
```

- [ ] **Step 2: Write the failing test**

Create `src/app/use-cases/__tests__/get-stats.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { GetStats } from "../get-stats.js";
import { InMemoryReminderRepository } from "./helpers/in-memory-repo.js";
import { Reminder } from "../../../domain/reminder.js";
import type { SourceSnapshot } from "../../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;

function snapshot(id: number, text: string | null): SourceSnapshot {
  return {
    id,
    chatId: 100,
    messageId: 200 + id,
    chatUsername: null,
    senderName: null,
    senderUsername: null,
    messageText: text,
    mediaFileId: null,
    mediaType: null,
    isMediaProtected: false,
    createdAt: id,
  };
}

describe("GetStats use-case", () => {
  let repo: InMemoryReminderRepository;
  let useCase: GetStats;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    useCase = new GetStats(repo);
  });

  it("delegates status counts and average reaction time from the repository", async () => {
    repo.reminders.set(
      1,
      Reminder.reconstitute({
        id: 1,
        snapshot: snapshot(1, "a"),
        state: "pending",
        createdAt: 1000,
      })
    );

    const result = await useCase.execute();

    expect(result.statusCounts.pending).toBe(1);
    expect(result.avgReactionTimeMs).toBeNull();
  });

  it("converts each longest-active entry's raw message text into a bounded preview", async () => {
    const long = "x".repeat(250);
    repo.reminders.set(
      1,
      Reminder.reconstitute({
        id: 1,
        snapshot: snapshot(1, long),
        state: "pending",
        createdAt: 1000,
      })
    );

    const result = await useCase.execute();

    expect(result.longestActive[0]!.preview.length).toBeLessThanOrEqual(100);
    expect(result.longestActive[0]!.preview.endsWith("…")).toBe(true);
    expect(result.longestActive[0]!.reminderId).toBe(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/app/use-cases/__tests__/get-stats.test.ts`
Expected: FAIL — cannot find module `../get-stats.js`

- [ ] **Step 4: Implement `GetStats`**

Create `src/app/use-cases/get-stats.ts`:

```ts
import type { ReminderRepository, ReminderStatusCounts } from "../ports/reminder-repository.js";
import { buildPreview } from "./list-active-reminders.js";

export interface StatsLongestActiveEntry {
  reminderId: number;
  preview: string;
  ageMs: number;
}

export interface StatsSummary {
  statusCounts: ReminderStatusCounts;
  avgReactionTimeMs: number | null;
  longestActive: StatsLongestActiveEntry[];
}

export class GetStats {
  constructor(private readonly repo: ReminderRepository) {}

  async execute(): Promise<StatsSummary> {
    const stats = await this.repo.getStats();
    return {
      statusCounts: stats.statusCounts,
      avgReactionTimeMs: stats.avgReactionTimeMs,
      longestActive: stats.longestActive.map((entry) => ({
        reminderId: entry.reminderId,
        preview: buildPreview(entry.messageText),
        ageMs: entry.ageMs,
      })),
    };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/use-cases/__tests__/get-stats.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/use-cases/list-active-reminders.ts src/app/use-cases/get-stats.ts src/app/use-cases/__tests__/get-stats.test.ts
git commit -m "feat: add GetStats use-case"
```

---

## Task 6: `/stats` message formatting

**Files:**
- Create: `src/ports/handlers/stats-handler.ts`
- Create: `src/ports/__tests__/stats-handler.test.ts`

**Interfaces:**
- Consumes: `GetStats`, `StatsSummary` (Task 5).
- Produces:
  ```ts
  export function formatStatsMessage(stats: StatsSummary): string;
  export async function handleStats(ctx: MinimalCtx, statsUC: GetStats): Promise<void>;
  ```
  Task 7's `router.ts` consumes `handleStats`.

- [ ] **Step 1: Write the failing test**

Create `src/ports/__tests__/stats-handler.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatStatsMessage } from "../handlers/stats-handler.js";
import type { StatsSummary } from "../../app/use-cases/get-stats.js";

function baseStats(overrides: Partial<StatsSummary> = {}): StatsSummary {
  return {
    statusCounts: {
      awaitingTime: 0,
      pending: 0,
      firing: 0,
      fired: 0,
      closedAfterFiring: 0,
      cancelledBeforeFiring: 0,
      expired: 0,
    },
    avgReactionTimeMs: null,
    longestActive: [],
    ...overrides,
  };
}

describe("formatStatsMessage", () => {
  it("renders each status count line", () => {
    const text = formatStatsMessage(
      baseStats({
        statusCounts: {
          awaitingTime: 2,
          pending: 5,
          firing: 0,
          fired: 1,
          closedAfterFiring: 10,
          cancelledBeforeFiring: 2,
          expired: 3,
        },
      })
    );
    expect(text).toContain("Очікує часу: 2");
    expect(text).toContain("Заплановано: 5");
    expect(text).toContain("Спрацьовує: 0");
    expect(text).toContain("Спрацювало: 1");
    expect(text).toContain("Закрито після спрацювання: 10");
    expect(text).toContain("Скасовано заздалегідь: 2");
    expect(text).toContain("Прострочено: 3");
  });

  it("renders '—, немає даних' when there is no reaction-time data", () => {
    const text = formatStatsMessage(baseStats());
    expect(text).toContain("Середній час реакції: —, немає даних");
  });

  it("renders formatted average reaction time when present", () => {
    const text = formatStatsMessage(baseStats({ avgReactionTimeMs: (2 * 60 + 15) * 60_000 }));
    expect(text).toContain("Середній час реакції: 2 год 15 хв");
  });

  it("renders 'Активних нагадувань немає' when longestActive is empty", () => {
    const text = formatStatsMessage(baseStats());
    expect(text).toContain("Активних нагадувань немає");
  });

  it("renders each longest-active row with its formatted age", () => {
    const text = formatStatsMessage(
      baseStats({
        longestActive: [{ reminderId: 1, preview: "Купити квитки", ageMs: (5 * 24 + 3) * 60 * 60_000 }],
      })
    );
    expect(text).toContain("1. Купити квитки — 5 дн 3 год");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ports/__tests__/stats-handler.test.ts`
Expected: FAIL — cannot find module `../handlers/stats-handler.js`

- [ ] **Step 3: Implement the handler**

Create `src/ports/handlers/stats-handler.ts`:

```ts
import type { GetStats, StatsSummary } from "../../app/use-cases/get-stats.js";

type MinimalCtx = {
  reply: (text: string, opts?: any) => Promise<any>;
};

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days} дн ${hours} год`;
  if (hours > 0) return `${hours} год ${minutes} хв`;
  return `${minutes} хв`;
}

export function formatStatsMessage(stats: StatsSummary): string {
  const c = stats.statusCounts;
  const lines = [
    "📊 Статистика нагадувань",
    "",
    "За статусами:",
    `• Очікує часу: ${c.awaitingTime}`,
    `• Заплановано: ${c.pending}`,
    `• Спрацьовує: ${c.firing}`,
    `• Спрацювало: ${c.fired}`,
    `• Закрито після спрацювання: ${c.closedAfterFiring}`,
    `• Скасовано заздалегідь: ${c.cancelledBeforeFiring}`,
    `• Прострочено: ${c.expired}`,
    "",
    `Середній час реакції: ${
      stats.avgReactionTimeMs === null ? "—, немає даних" : formatDuration(stats.avgReactionTimeMs)
    }`,
    "",
    "Найдовші активні нагадування:",
  ];

  if (stats.longestActive.length === 0) {
    lines.push("Активних нагадувань немає");
  } else {
    stats.longestActive.forEach((item, i) => {
      lines.push(`${i + 1}. ${item.preview} — ${formatDuration(item.ageMs)}`);
    });
  }

  return lines.join("\n");
}

export async function handleStats(ctx: MinimalCtx, statsUC: GetStats): Promise<void> {
  const stats = await statsUC.execute();
  await ctx.reply(formatStatsMessage(stats));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ports/__tests__/stats-handler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ports/handlers/stats-handler.ts src/ports/__tests__/stats-handler.test.ts
git commit -m "feat: add /stats message formatting"
```

---

## Task 7: Wire `/stats` into the router and command menu

**Files:**
- Modify: `src/ports/router.ts`
- Modify: `src/main.ts`
- Create: `src/ports/__tests__/stats-router.test.ts`

**Interfaces:**
- Consumes: `GetStats` (Task 5), `handleStats` (Task 6).
- Produces: a working `/stats` command end-to-end, reachable the same way `/list` is (typed command or Telegram's command menu).

- [ ] **Step 1: Write the failing test**

Create `src/ports/__tests__/stats-router.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRouter } from "../router.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";
import { InMemoryPendingPromptRepository } from "../../app/use-cases/__tests__/helpers/in-memory-pending-prompt-repo.js";
import { Reminder } from "../../domain/reminder.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";

const OWNER_ID = 123456789;
const NON_OWNER_ID = 999999;

function makeGateway(): TelegramGateway {
  return {
    sendReminder: vi.fn().mockResolvedValue({ messageId: 99 }),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageToPlaceholder: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function snapshot(id: number, text: string): SourceSnapshot {
  return {
    id,
    chatId: 100,
    messageId: 200 + id,
    chatUsername: null,
    senderName: null,
    senderUsername: null,
    messageText: text,
    mediaFileId: null,
    mediaType: null,
    isMediaProtected: false,
    createdAt: id,
  };
}

describe("Router: /stats wiring", () => {
  let repo: InMemoryReminderRepository;
  let router: ReturnType<typeof buildRouter>;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, "Europe/Kyiv");
    router = buildRouter(repo, makeGateway(), OWNER_ID, new InMemoryPendingPromptRepository());
  });

  function statsCtx(fromId: number) {
    return {
      message: { text: "/stats" },
      from: { id: fromId },
      reply: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("routes /stats for the Owner and replies with the stats summary", async () => {
    repo.reminders.set(
      1,
      Reminder.reconstitute({ id: 1, snapshot: snapshot(1, "task one"), state: "pending", createdAt: 1000 })
    );
    const ctx = statsCtx(OWNER_ID);
    await router.handleUpdate(ctx as any);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply.mock.calls[0]![0]).toContain("📊 Статистика нагадувань");
    expect(ctx.reply.mock.calls[0]![0]).toContain("Заплановано: 1");
  });

  it("ignores /stats from a non-Owner", async () => {
    const ctx = statsCtx(NON_OWNER_ID);
    await router.handleUpdate(ctx as any);
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ports/__tests__/stats-router.test.ts`
Expected: FAIL — `/stats` falls through `buildRouter`'s `handleUpdate` with no matching branch, so `ctx.reply` is never called (test 1 fails on `toHaveBeenCalledTimes(1)`)

- [ ] **Step 3: Wire the router**

In `src/ports/router.ts`, add imports after the existing `CancelPendingReminder` import:

```ts
import { GetStats } from "../app/use-cases/get-stats.js";
import { handleStats } from "./handlers/stats-handler.js";
```

Construct the use-case in `buildRouter`, after `const cancelUC = new CancelPendingReminder(repo);`:

```ts
  const statsUC = new GetStats(repo);
```

Add the routing branch, right after the existing `/list` block:

```ts
      if (msg?.text?.startsWith("/list")) {
        return handleList(ctx, repo, listUC);
      }

      if (msg?.text?.startsWith("/stats")) {
        return handleStats(ctx, statsUC);
      }
```

- [ ] **Step 4: Register the command in the Telegram menu**

In `src/main.ts`, update the `setMyCommands` call:

```ts
  await bot.api.setMyCommands(
    [
      { command: "list", description: "Активні нагадування" },
      { command: "stats", description: "Статистика нагадувань" },
    ],
    { scope: { type: "chat", chat_id: OWNER_CHAT_ID } }
  );
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/ports/__tests__/stats-router.test.ts`
Expected: PASS

Then run the full suite and the build:

Run: `npx vitest run`
Expected: PASS (all files, no regressions)

Run: `npm run build`
Expected: exits 0, no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/ports/router.ts src/main.ts src/ports/__tests__/stats-router.test.ts
git commit -m "feat: wire /stats command into router and command menu"
```

---

## Post-implementation checklist

- [ ] `npx vitest run` — full suite green
- [ ] `npm run build` — no TypeScript errors
- [ ] Manually verify against a real (or local dev) bot: `/stats` with zero reminders, with a mix of statuses, and with more than 5 active reminders (only the 5 oldest should appear)
