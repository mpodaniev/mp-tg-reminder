# План поступових покращень telegram-reminder

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрити знахідки аудиту 2026-07-08 — від DoS-вектора та зламаного graceful shutdown до гігієни залежностей, CI й документації — серією малих незалежних задач.

**Architecture:** Кожна задача — самодостатня зміна з власним тест-циклом і комітом, у порядку спадання пріоритету. Архітектура застосунку (ports-and-adapters, SQLite, webhook+wake на Fly.io) не змінюється — лише зміцнюється периметр, деплой і тулінг.

**Tech Stack:** Node 22, TypeScript (strict), grammY, better-sqlite3, vitest, Fly.io, GitHub Actions.

## Global Constraints

- Node `>=22` (package.json engines) — не знижувати.
- Коміти без trailer'а `Co-Authored-By` (глобальне правило користувача).
- Усі коментарі в коді — лише англійською.
- Встановлення нових пакетів відбувається тільки в межах задач цього плану, схваленого користувачем; нічого «корисного поза планом» не додавати.
- Тексти повідомлень бота — українською, як у наявному коді.
- Після кожної задачі `npm run build && npm test` мають бути зеленими (базлайн: 38 файлів, 201 тест).

---

## Підсумок аудиту 2026-07-08 (контекст для виконавця)

Стан репозиторію добрий: чиста ports-and-adapters структура, 201/201 тестів, `npm audit` — 0 вразливостей, секрети в історію git не потрапляли. Знахідки за пріоритетом:

| # | Пріоритет | Знахідка | Де | Задача |
|---|-----------|----------|----|--------|
| 1 | ✅ Зроблено | Немає ліміту розміру тіла HTTP-запиту; тіло буферизується до auth → OOM/DoS на публічному URL | `src/ports/http/server.ts:38` | Task 1 |
| 2 | 🔴 Термінове | `sh -c` як PID 1 не пересилає SIGTERM → graceful shutdown ніколи не виконується | `Dockerfile:18`, `src/main.ts:116` | Task 2 |
| 3 | 🔴 Швидка перемога | `@grammyjs/conversations` не використовується ніде в коді | `package.json:19` | Task 3 |
| 4 | 🟠 Важливе | `better-sqlite3` 9.6 → 12.x (prebuilt для Node 22; прибрати python3/make/g++ зі збірки) | `package.json`, `Dockerfile:2` | Task 4 |
| 5 | 🟠 Важливе | Runtime-образ містить devDependencies (typescript, vitest) | `Dockerfile:12` | Task 5 |
| 6 | 🟠 Важливе | `vitest` 1.6 → 4.x (1.x без security-фіксів) | `package.json` | Task 6 |
| 7 | 🟠 Важливе | Немає перевіреної стратегії бекапів SQLite-волюма | `fly.toml:10` | Task 7 |
| 8 | 🟡 Середнє | Немає README.md і .env.example у корені | корінь | Task 8 |
| 9 | 🟡 Середнє | Немає лінтера; CI без lint-кроку; `ctx: any` у роутері | `.github/workflows/deploy.yml` | Task 9 |
| 10 | 🟡 Середнє | `setWebhook` + `bot.init()` на кожному холодному старті (кожні ~3 хв) — латентність і rate-limit | `src/main.ts:104` | Task 10 |
| 11 | 🟢 Низьке | `parseCustomTime` приймає неіснуючі дати («31.02.2026» → 3 березня) | `src/ports/router.ts:282` | Task 11 |
| 12 | 🟢 Низьке | CI: `flyctl-actions@master` непінований; немає concurrency-групи | `.github/workflows/deploy.yml:31` | Task 12 |
| 13 | 🟢 Низьке | Немає Dependabot/Renovate | `.github/` | Task 13 |

**Свідомо відкладено (не робити в цьому плані):**
- *Fast-ack вебхука* (відповідати 200 до обробки): для персонального бота з одним користувачем ризик retry-дублів низький, а зміна ламає модель «машина спить, коли немає роботи».
- *Non-root user у Docker*: Fly-волюм монтується від root; chown на змонтованому волюмі ускладнює деплой заради малої вигоди в single-tenant microVM.
- *TypeScript 6*: мажор без практичної вигоди зараз; Dependabot (Task 13) підкаже, коли екосистема доганить.

---

### Task 1: Ліміт розміру тіла HTTP-запиту (413) ✅ Виконано (коміти `ed19f6b`, `c50fca1`, `046b824`, `5b9a20e`)

**Files:**
- Modify: `src/ports/http/server.ts`
- Test: `src/ports/http/__tests__/server.test.ts`

**Interfaces:**
- Consumes: `buildHttpServer(routes: HttpRoutes): Server` — сигнатура не змінюється.
- Produces: сервер відповідає `413` з `{ code: "http.payload_too_large", ... }` на тіло понад 1 MiB; хендлери не викликаються.

- [x] **Step 1: Write the failing test**

Додати в кінець `describe` у `src/ports/http/__tests__/server.test.ts`:

```typescript
  it("returns 413 for a body over 1 MiB without invoking the handler", async () => {
    const big = Buffer.alloc(1024 * 1024 + 1, 0x61);
    const res = await fetch(`${baseUrl}/webhook/telegram`, { method: "POST", body: big });
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({
      code: "http.payload_too_large",
      message: "Request body exceeds limit",
    });
    expect(webhookHandler).not.toHaveBeenCalled();
  });

  it("still accepts a body just under the limit", async () => {
    const ok = Buffer.alloc(1024, 0x61);
    const res = await fetch(`${baseUrl}/webhook/telegram`, { method: "POST", body: ok });
    expect(res.status).toBe(200);
    expect(webhookHandler).toHaveBeenCalledTimes(1);
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ports/http/__tests__/server.test.ts`
Expected: FAIL — перший новий тест отримує 200 замість 413.

- [x] **Step 3: Write minimal implementation**

У `src/ports/http/server.ts` додати константу та guard. Повний новий вміст функції `handleRequest` (сигнатура і решта файлу без змін):

```typescript
// Telegram updates are a few KB; anything near this cap is not a legitimate
// caller. The cap is enforced before auth, because auth lives inside the
// handlers and would otherwise run only after the whole body is buffered.
const MAX_BODY_BYTES = 1024 * 1024;

async function handleRequest(req: IncomingMessage, res: ServerResponse, routes: HttpRoutes): Promise<void> {
  const method = req.method ?? "";
  const path = (req.url ?? "").split("?")[0];

  const handler =
    method === "POST" && path === "/webhook/telegram"
      ? routes.webhook
      : method === "POST" && path === "/wake"
        ? routes.wake
        : null;

  if (!handler) {
    res.statusCode = 404;
    res.end();
    return;
  }

  // Error boundary: any unexpected throw from body reading or the handler
  // (e.g. a DB error inside scheduler.tick(), or grammy rejecting a malformed
  // update) must still close the connection with a 500 rather than leaving the
  // caller hanging to timeout and the rejection swallowed by the `void` above.
  try {
    const declared = parseInt(String(req.headers["content-length"] ?? ""), 10);
    if (!Number.isNaN(declared) && declared > MAX_BODY_BYTES) {
      respondPayloadTooLarge(res);
      req.destroy();
      return;
    }

    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of req) {
      received += (chunk as Buffer).length;
      if (received > MAX_BODY_BYTES) {
        // Chunked transfer without a content-length header: stop buffering as
        // soon as the cap is crossed. The malicious client may observe a
        // connection error instead of the 413 body — that is acceptable.
        respondPayloadTooLarge(res);
        req.destroy();
        return;
      }
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks);

    await handler(req, res, body);
  } catch (err) {
    console.error({ module: "http", event: "handler_error", path, error: String(err) });
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ code: "http.internal_error", message: "Internal error" }));
    } else {
      res.end();
    }
  }
}

function respondPayloadTooLarge(res: ServerResponse): void {
  res.statusCode = 413;
  res.setHeader("content-type", "application/json");
  res.setHeader("connection", "close");
  res.end(JSON.stringify({ code: "http.payload_too_large", message: "Request body exceeds limit" }));
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm run build && npm test`
Expected: PASS — 203 тести (201 + 2 нових).

- [x] **Step 5: Commit**

```bash
git add src/ports/http/server.ts src/ports/http/__tests__/server.test.ts
git commit -m "fix(http): cap request body at 1 MiB before auth to close DoS vector"
```

**Примітка:** реалізація в `src/ports/http/server.ts` пішла далі мінімального патча вище — три подальші коміти (`c50fca1`, `046b824`, `5b9a20e`) виправили послідовність закриття з'єднання після 413 (дочекатись відповіді → дочекатись зливу тіла → обмежити час зливу таймаутом), щоб сам 413-шлях не став новим DoS-вектором.

---

### Task 2: Graceful shutdown у Docker (exec + видимий лог)

**Files:**
- Modify: `Dockerfile`
- Modify: `src/main.ts:116-122`

**Interfaces:**
- Consumes: наявний `shutdown()` у `src/main.ts` та `Scheduler.stop()`.
- Produces: node стає PID 1 (отримує SIGTERM від Fly), shutdown логуються подією `{ module: "main", event: "shutdown" }`.

Тестів немає (інфраструктурна зміна поза межами vitest); верифікація — кроки 3–4.

- [ ] **Step 1: Fix the Dockerfile CMD**

Замінити останній рядок `Dockerfile`:

```dockerfile
# `exec` makes node PID 1 so it receives SIGTERM directly from the platform;
# without it the shell stays PID 1 and never forwards signals, so the app's
# graceful-shutdown handler (await in-flight tick, close SQLite) never runs.
CMD ["sh", "-c", "node dist/infra/db/migrate.js up && exec node dist/main.js"]
```

- [ ] **Step 2: Make shutdown observable in logs**

У `src/main.ts` замінити функцію `shutdown`:

```typescript
function shutdown(): void {
  console.log({ module: "main", event: "shutdown" });
  httpServer.close();
  void scheduler.stop().then(() => {
    db.close();
    process.exit(0);
  });
}
```

- [ ] **Step 3: Verify the exec mechanism locally (if Docker is available)**

```bash
docker build -t tg-reminder-plan-check .
docker run --rm --entrypoint sh tg-reminder-plan-check -c "exec node -e 'console.log(process.pid)'"
```

Expected: виводить `1`. Якщо Docker недоступний локально — пропустити, покластися на Step 4.

- [ ] **Step 4: Verify build + tests still green**

Run: `npm run build && npm test`
Expected: PASS. (Після деплою: `fly logs -a mp-tg-reminder` має показувати подію `shutdown` при auto-stop машини — записати результат у PR/нотатку.)

- [ ] **Step 5: Commit**

```bash
git add Dockerfile src/main.ts
git commit -m "fix(deploy): exec node as PID 1 so SIGTERM reaches the graceful-shutdown handler"
```

---

### Task 3: Видалити невикористаний @grammyjs/conversations

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Confirm the package is unused**

Run: `grep -rn "@grammyjs/conversations" src/ test/`
Expected: порожній вивід.

- [ ] **Step 2: Remove it**

Run: `npm uninstall @grammyjs/conversations`

- [ ] **Step 3: Verify build + tests**

Run: `npm run build && npm test`
Expected: PASS, як до зміни.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): drop unused @grammyjs/conversations"
```

---

### Task 4: Оновити better-sqlite3 до ^12 і спростити Docker-збірку

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `Dockerfile:1-2`

**Interfaces:**
- Consumes: `Database` API з `better-sqlite3` (використання в `src/infra/db/*` — API `prepare/run/get/all/pragma` стабільне між 9 і 12).
- Produces: залежність із prebuilt-бінарниками для Node 22; Docker-збірка без C++-тулчейна.

- [ ] **Step 1: Upgrade the packages**

```bash
npm install better-sqlite3@^12
npm install -D @types/better-sqlite3@latest
```

- [ ] **Step 2: Run the full suite against the new driver**

Run: `npm run build && npm test`
Expected: PASS — SQLite-репозиторії покриті `src/infra/__tests__/sqlite-reminder-repository.test.ts` та інтеграційними тестами.

- [ ] **Step 3: Drop the build toolchain from the Dockerfile**

Замінити перші два рядки `Dockerfile`:

```dockerfile
FROM node:22-slim AS builder
WORKDIR /app
```

(рядок `RUN apt-get update && apt-get install -y python3 make g++ ...` видалити — v12 має prebuilt-бінарники для linux x64/arm64 glibc).

- [ ] **Step 4: Verify the Docker build (if Docker is available)**

Run: `docker build -t tg-reminder-plan-check .`
Expected: збірка успішна без компіляції node-gyp. Якщо Docker недоступний — CI-збірка на Fly перевірить це на деплої.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json Dockerfile
git commit -m "chore(deps): better-sqlite3 ^12 with Node 22 prebuilds; drop gyp toolchain from image"
```

---

### Task 5: Прибрати devDependencies з runtime-образу

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Reinstall prod-only deps after the build stage**

Повний новий вміст `Dockerfile` (з урахуванням Task 2 і Task 4):

```dockerfile
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
# Strip devDependencies so the runtime stage copies a prod-only node_modules.
RUN npm ci --omit=dev

FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY migrations/ ./migrations/
RUN mkdir -p /data

# `exec` makes node PID 1 so it receives SIGTERM directly from the platform;
# without it the shell stays PID 1 and never forwards signals, so the app's
# graceful-shutdown handler (await in-flight tick, close SQLite) never runs.
CMD ["sh", "-c", "node dist/infra/db/migrate.js up && exec node dist/main.js"]
```

- [ ] **Step 2: Verify the image (if Docker is available)**

```bash
docker build -t tg-reminder-plan-check .
docker run --rm --entrypoint sh tg-reminder-plan-check -c "ls node_modules | grep -c typescript || echo prod-only-ok"
```

Expected: `prod-only-ok` (typescript відсутній у runtime node_modules).

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "chore(deploy): strip devDependencies from the runtime image"
```

---

### Task 6: Оновити vitest до ^4

**Files:**
- Modify: `package.json`, `package-lock.json`
- Possibly modify: `vitest.config.ts` (лише якщо v4 відхилить наявні опції)

- [ ] **Step 1: Upgrade**

Run: `npm install -D vitest@^4`

- [ ] **Step 2: Run the suite**

Run: `npm test`
Expected: PASS — конфіг мінімальний (`include`/`exclude`/`globals`/`passWithNoTests`), сумісний із v4. Якщо конфіг відхилено — прибрати/перейменувати лише ту опцію, на яку вкаже помилка, і перезапустити.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(deps): vitest ^4"
```

---

### Task 7: Перевірити й задокументувати бекапи SQLite (ops, потребує flyctl)

**Files:**
- Create: `docs/ops/backups.md`

Ця задача потребує автентифікованого `flyctl`. Якщо його немає в середовищі виконавця — створити документ із командами та позначкою «результат перевірити вручну», і сказати про це в підсумку.

- [ ] **Step 1: Inspect the volume and its snapshots**

```bash
fly volumes list -a mp-tg-reminder
fly volumes snapshots list <volume-id> -a mp-tg-reminder
```

Expected: волюм `reminders_data` існує; список щоденних снапшотів непорожній (Fly робить їх автоматично, ретеншен за замовчуванням 5 днів).

- [ ] **Step 2: Write the ops doc**

Створити `docs/ops/backups.md`:

```markdown
# Бекапи SQLite (mp-tg-reminder)

Уся база (`/data/reminders.db`) живе на одному Fly-волюмі `reminders_data`
(fly.toml, `[[mounts]]`). Втрата волюма = втрата всіх нагадувань.

## Що є зараз

Fly.io робить автоматичні щоденні снапшоти волюмів (ретеншен ~5 днів).
Перевірка:

    fly volumes list -a mp-tg-reminder
    fly volumes snapshots list <volume-id> -a mp-tg-reminder

Останнє підтвердження, що снапшоти існують: <дата перевірки / "не перевірено">.

## Відновлення зі снапшота

    fly volumes create reminders_data --snapshot-id <snapshot-id> --region ams -a mp-tg-reminder

Потім прив'язати нову машину до відновленого волюма (fly.toml `[[mounts]]`).

## Подальший крок (не зроблено, свідомо відкладено)

Litestream-реплікація в об'єктне сховище (S3/R2) дала б point-in-time
відновлення замість щоденної точки. Повернутися до цього, якщо бот стане
критичним або ретеншену 5 днів виявиться замало.
```

У рядку «Останнє підтвердження» записати фактичну дату, якщо Step 1 виконано.

- [ ] **Step 3: Commit**

```bash
git add docs/ops/backups.md
git commit -m "docs(ops): document the SQLite volume snapshot/restore story"
```

---

### Task 8: README.md і .env.example

**Files:**
- Create: `README.md`
- Create: `.env.example`

- [ ] **Step 1: Create .env.example**

```bash
# Telegram bot token from @BotFather
BOT_TOKEN=

# Numeric Telegram user id of the single Owner (the only authorized user)
OWNER_TELEGRAM_ID=

# SQLite database file (Fly mounts a volume at /data)
DB_PATH=./data/reminders.db

# HTTP port for the webhook + wake endpoints
PORT=3000

# Public webhook URL Telegram will POST updates to
WEBHOOK_URL=https://mp-tg-reminder.fly.dev/webhook/telegram

# Shared secret Telegram echoes back in X-Telegram-Bot-Api-Secret-Token
WEBHOOK_SECRET_TOKEN=

# Bearer token the external cron must send to POST /wake
WAKE_BEARER_TOKEN=

# Cadence of the external wake cron, in ms (drives the AC-03 delay estimate)
WAKE_INTERVAL_MS=180000
```

- [ ] **Step 2: Create README.md**

```markdown
# telegram-reminder

Персональний Telegram-бот: переслані повідомлення стають нагадуваннями,
які бот надсилає у вказаний час. Один користувач (Owner), SQLite, Fly.io.

## Архітектура

Ports-and-adapters: `src/domain` (стани нагадування) → `src/app` (use-cases
і порти) → `src/infra` (SQLite, grammY) → `src/ports` (Telegram-роутер,
HTTP-периметр). Машина на Fly повністю зупиняється між подіями: Telegram
будить її вебхуком, зовнішній cron — викликом `POST /wake` (див.
`docs/features/webhook-cron-wake/`).

## Запуск локально

    npm ci
    cp .env.example .env   # заповнити значення
    npm run build
    npm run dev

## Тести

    npm test

## Деплой

Пуш у `master` → GitHub Actions (`.github/workflows/deploy.yml`) жене
build+test і `flyctl deploy`. Секрети застосунку — через `fly secrets set`.
Зовнішній cron має викликати `POST /wake` з bearer-токеном кожні
`WAKE_INTERVAL_MS` (за замовчуванням 3 хв).

## Змінні середовища

Див. `.env.example` — кожна змінна прокоментована. Обов'язкові:
`BOT_TOKEN`, `OWNER_TELEGRAM_ID`, `WEBHOOK_URL`, `WEBHOOK_SECRET_TOKEN`,
`WAKE_BEARER_TOKEN`.

## Бекапи

Див. `docs/ops/backups.md`.

## Документація фіч

SDD-артефакти (spec / SAD / ADR / tasks) — у `docs/features/<slug>/`.
Карта архітектури — `docs/architecture-map.md`.
```

- [ ] **Step 3: Verify .env.example is not ignored**

Run: `git check-ignore -v .env.example || echo not-ignored`
Expected: `not-ignored` (у `.gitignore` вже є виняток `!.env.example`).

- [ ] **Step 4: Commit**

```bash
git add README.md .env.example
git commit -m "docs: add root README and .env.example"
```

---

### Task 9: ESLint + lint-крок у CI

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (scripts, devDependencies)
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Install ESLint (flat config + typescript-eslint)**

Run: `npm install -D eslint @eslint/js typescript-eslint`

- [ ] **Step 2: Create eslint.config.js**

```javascript
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "docs/", "data/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The Telegram router currently types ctx as `any` (src/ports/router.ts);
      // keep this a warning until the router is migrated to grammy's Context.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  }
);
```

- [ ] **Step 3: Add the lint script**

У `package.json` до `scripts` додати:

```json
"lint": "eslint src test"
```

- [ ] **Step 4: Run and fix**

Run: `npm run lint`
Expected: 0 errors (warnings про `any` допустимі). Якщо є errors — виправити точково (не вимикати правила глобально) і перезапустити.

- [ ] **Step 5: Add lint to CI**

У `.github/workflows/deploy.yml`, job `test`, після `- run: npm ci` додати рядок:

```yaml
      - run: npm run lint
```

- [ ] **Step 6: Verify build + tests still green**

Run: `npm run build && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js package.json package-lock.json .github/workflows/deploy.yml
git commit -m "chore(lint): add ESLint flat config and CI lint step"
```

---

### Task 10: Умовний setWebhook на холодному старті

**Files:**
- Create: `src/infra/telegram/ensure-webhook.ts`
- Test: `src/infra/__tests__/ensure-webhook.test.ts`
- Modify: `src/main.ts:104-105`

**Interfaces:**
- Consumes: `bot.api.getWebhookInfo()` / `bot.api.setWebhook(url, { secret_token })` з grammY.
- Produces: `ensureWebhook(api: WebhookApi, url: string, secretToken: string, force?: boolean): Promise<boolean>` — повертає `true`, якщо вебхук було (пере)реєстровано.

- [ ] **Step 1: Write the failing tests**

Створити `src/infra/__tests__/ensure-webhook.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { ensureWebhook } from "../telegram/ensure-webhook.js";

const URL = "https://app.fly.dev/webhook/telegram";

function makeApi(currentUrl: string) {
  return {
    getWebhookInfo: vi.fn(async () => ({ url: currentUrl })),
    setWebhook: vi.fn(async () => true),
  };
}

describe("ensureWebhook", () => {
  it("skips setWebhook when Telegram already points at the target URL", async () => {
    const api = makeApi(URL);
    const changed = await ensureWebhook(api, URL, "secret");
    expect(changed).toBe(false);
    expect(api.setWebhook).not.toHaveBeenCalled();
  });

  it("registers the webhook when the URL differs", async () => {
    const api = makeApi("");
    const changed = await ensureWebhook(api, URL, "secret");
    expect(changed).toBe(true);
    expect(api.setWebhook).toHaveBeenCalledWith(URL, { secret_token: "secret" });
  });

  it("re-registers when force is set even if the URL matches", async () => {
    const api = makeApi(URL);
    const changed = await ensureWebhook(api, URL, "secret", true);
    expect(changed).toBe(true);
    expect(api.setWebhook).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/infra/__tests__/ensure-webhook.test.ts`
Expected: FAIL — модуль `ensure-webhook.js` не існує.

- [ ] **Step 3: Implement ensureWebhook**

Створити `src/infra/telegram/ensure-webhook.ts`:

```typescript
export interface WebhookApi {
  getWebhookInfo(): Promise<{ url?: string }>;
  setWebhook(url: string, opts: { secret_token: string }): Promise<unknown>;
}

// setWebhook is rate-limited and this app cold-starts on every wake cycle
// (fly.toml auto_start), so skip the call when Telegram already points at the
// target URL. Caveat: getWebhookInfo does not expose the secret token, so a
// rotated WEBHOOK_SECRET_TOKEN with an unchanged URL needs one boot with
// force=true (WEBHOOK_FORCE_SET=1) to take effect.
export async function ensureWebhook(
  api: WebhookApi,
  url: string,
  secretToken: string,
  force = false
): Promise<boolean> {
  if (!force) {
    const info = await api.getWebhookInfo();
    if (info.url === url) return false;
  }
  await api.setWebhook(url, { secret_token: secretToken });
  return true;
}
```

- [ ] **Step 4: Wire it into main.ts**

У `src/main.ts` замінити рядок `await bot.api.setWebhook(WEBHOOK_URL, { secret_token: WEBHOOK_SECRET_TOKEN });` на:

```typescript
const webhookChanged = await ensureWebhook(
  bot.api,
  WEBHOOK_URL,
  WEBHOOK_SECRET_TOKEN,
  process.env["WEBHOOK_FORCE_SET"] === "1"
);
if (webhookChanged) {
  console.log({ module: "main", event: "webhook_registered", url: WEBHOOK_URL });
}
```

і додати імпорт поряд з іншими:

```typescript
import { ensureWebhook } from "./infra/telegram/ensure-webhook.js";
```

- [ ] **Step 5: Document the rotation caveat in .env.example**

Додати в кінець `.env.example` (створеного в Task 8):

```bash
# Set to 1 for one boot after rotating WEBHOOK_SECRET_TOKEN with an unchanged
# URL: getWebhookInfo cannot see the secret, so re-registration must be forced.
#WEBHOOK_FORCE_SET=1
```

- [ ] **Step 6: Run the full suite**

Run: `npm run build && npm test`
Expected: PASS — плюс 3 нові тести.

- [ ] **Step 7: Commit**

```bash
git add src/infra/telegram/ensure-webhook.ts src/infra/__tests__/ensure-webhook.test.ts src/main.ts .env.example
git commit -m "perf(boot): skip setWebhook on cold start when the URL is already registered"
```

---

### Task 11: parseCustomTime — відхиляти неіснуючі дати

**Files:**
- Modify: `src/ports/router.ts:275-285`
- Test: `src/ports/__tests__/custom-time-conversation.test.ts` (додати кейси в кінець наявного describe або новий describe поряд)

**Interfaces:**
- Consumes/Produces: `parseCustomTime(text: string, timezone: string): number | null` — сигнатура без змін; неіснуюча календарна дата тепер повертає `null`.

- [ ] **Step 1: Write the failing tests**

Додати в кінець `src/ports/__tests__/custom-time-conversation.test.ts` (імпорт `parseCustomTime` з `../router.js` у файлі вже є, рядок 6):

```typescript
describe("parseCustomTime rejects non-existent calendar dates", () => {
  it("returns null for 31.02.2026 instead of rolling over to March", () => {
    expect(parseCustomTime("31.02.2026 10:00", "Europe/Kyiv")).toBeNull();
  });

  it("returns null for 31.04.2026 (April has 30 days)", () => {
    expect(parseCustomTime("31.04.2026", "Europe/Kyiv")).toBeNull();
  });

  it("accepts 29.02.2028 (leap year)", () => {
    expect(parseCustomTime("29.02.2028 10:00", "Europe/Kyiv")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ports/__tests__/custom-time-conversation.test.ts`
Expected: FAIL — перші два кейси отримують число (rollover), не `null`.

- [ ] **Step 3: Implement real-date validation**

У `src/ports/router.ts`, у гілці `fullMatch` функції `parseCustomTime`, замінити рядок з перевіркою `month < 1 || ...` на:

```typescript
    if (month < 1 || month > 12 || day < 1 || h > 23 || m > 59) return null;
    // Date.UTC silently rolls an invalid day into the next month
    // (31.02 -> 03.03); round-trip the components to reject that.
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
```

- [ ] **Step 4: Run the full suite**

Run: `npm run build && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ports/router.ts src/ports/__tests__/custom-time-conversation.test.ts
git commit -m "fix(parse): reject non-existent calendar dates instead of Date.UTC rollover"
```

---

### Task 12: CI — запінити flyctl-action і додати concurrency

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Find the latest release tag and its SHA**

```bash
gh api repos/superfly/flyctl-actions/releases/latest --jq .tag_name
gh api "repos/superfly/flyctl-actions/git/ref/tags/<tag_from_previous_command>" --jq .object.sha
```

Expected: тег (наприклад `v1.x`) і 40-символьний SHA. Якщо `gh` недоступний — подивитися останній реліз на https://github.com/superfly/flyctl-actions/releases і взяти SHA тега звідти.

- [ ] **Step 2: Pin the action and add a concurrency group**

У `.github/workflows/deploy.yml`:

1. Після блоку `on:` додати:

```yaml
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false
```

2. Рядок `- uses: superfly/flyctl-actions/setup-flyctl@master` замінити на (SHA — з кроку 1):

```yaml
      - uses: superfly/flyctl-actions/setup-flyctl@<sha-from-step-1> # <tag-from-step-1>
```

- [ ] **Step 3: Validate the workflow syntax**

Run: `gh workflow view "Test & Deploy" --repo mpodaniev/telegram-reminder 2>/dev/null || npx --yes yaml-lint .github/workflows/deploy.yml 2>/dev/null || node -e "require('node:fs').readFileSync('.github/workflows/deploy.yml','utf8')" `
Expected: файл читається; фінальна перевірка — зелений прогін Actions після пушу.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: pin flyctl action by SHA and serialize deploys with a concurrency group"
```

---

### Task 13: Dependabot

**Files:**
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Create the config**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      dev-dependencies:
        dependency-type: development

  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
```

- [ ] **Step 2: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci: enable weekly Dependabot for npm and GitHub Actions"
```

---

## Порядок виконання і залежності

- Task 1–3 — незалежні, робити першими (термінові).
- Task 4 → Task 5 (обидві правлять Dockerfile; Task 5 наведено вже з урахуванням Task 2 і 4).
- Task 8 → Task 10 (Step 5 задачі 10 дописує `.env.example`, створений у задачі 8). Якщо Task 10 виконується раніше — створити `.env.example` мінімально в її межах.
- Решта — незалежні.

## Верифікація після кожної фази

`npm run build && npm test` зелені; після деплою — перевірити `fly logs`: подія `shutdown` при auto-stop (Task 2), подія `webhook_registered` лише на першому старті після зміни URL (Task 10), відповідь 413 на завеликий POST (Task 1, можна перевірити `curl`-ом).
