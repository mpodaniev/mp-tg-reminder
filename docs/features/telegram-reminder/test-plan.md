---
status: Draft
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-06-13"
feature_size: "M"
---

# Test plan — telegram-reminder

Персональний Telegram-бот: захоплює переслані повідомлення, дурабл-зберігає нагадування у SQLite та повертає їх у призначений час з inline-кнопками (Snooze / Done / Delete / Go to source). Цей план відображає кожен критерій прийнятності §5 на щонайменше один іменований тест.

## Levels

`target_surfaces: [backend-service]` — UI-поверхня не оголошена; рівні Component / Visual-regression / E2E-through-UI не застосовуються.

| Рівень | Межа | Стратегія (без назв інструментів) |
|---|---|---|
| Unit | Чиста логіка без I/O: правило, калькуляція, валідатор | In-memory, без зовнішніх залежностей |
| Integration | Модуль проти реального SQLite (throwaway temp-файл per suite) | Ephemeral SQLite temp-файл, `PRAGMA foreign_keys = ON`; видаляється після suite |
| Contract | Порт `TelegramGateway`: форма вихідних викликів між use-case і grammY-адаптером | Реальний адаптер валідується проти узгодженого інтерфейсу; без hand-rolled stubs |
| E2E | Повний потік «перешли → промпт → розклад» через реальний grammY-роутер | TelegramGateway test-double + ephemeral SQLite |
| Load | p95 latency ≤ 2 с (єдиний числовий NFR, що потребує load-сценарію) | Інструмент у вашому репо, або напр. k6 / Locust |

## AC coverage

| AC (spec.md §5) | Назва тесту | Рівень | Очікуваний результат |
|---|---|---|---|
| AC-01 (US-01 happy path) | пересланe повідомлення викликає промпт «коли нагадати?» | integration + e2e | бот надсилає «Коли нагадати?» з quick-pick кнопками і «Довільний час»; нагадування входить у стан `awaiting_time` |
| AC-02 (US-02 happy path) | quick-pick розкладає нагадування на правильний wall-clock час | unit + integration | підтвердження відображає правильний часовий зсув; стан = `pending`; `scheduled_at` записано вірно в store |
| AC-03 (US-03 happy path) | валідний довільний час розкладає нагадування | unit + integration | час розібрано й підтверджено як майбутній; підтвердження надіслано; стан = `pending`; `scheduled_at` відповідає введеному |
| AC-04 (US-04 happy path) | due-нагадування спрацьовує і доставка підтверджена | integration | scheduler-тік вибирає due-рядок; перехід `firing→fired`; TelegramGateway отримує виклик надсилання зі змістом джерела і 4 кнопками (Snooze, Done, Delete, Go to source); `delivered_at` записано |
| AC-05 (US-05 happy path) | snooze оновлює `scheduled_at` і повертає стан `pending` | unit + integration | минулі wall-clock quick-picks приховано; новий `scheduled_at` записано в store; стан повертається до `pending`; повідомлення нагадування оновлено |
| AC-06 (US-06 happy path) | «Done» позначає нагадування вирішеним і видаляє повідомлення | integration | стан = `done`; gateway отримує delete-виклик для `fired_message_id`; якщо повідомлення >48 год → gateway отримує edit-виклик до empty/resolved placeholder |
| AC-07 (US-07 happy path) | «Delete» прибирає повідомлення без позначки «виконано» | integration | стан = `deleted`; gateway отримує delete-виклик; якщо повідомлення >48 год → gateway отримує edit-виклик до placeholder |
| AC-08 (US-03 error) | довільний час у минулому блокується | unit + integration | розклад скасовано; Owner отримує «час має бути в майбутньому»; стан нагадування незмінний; промпт залишається відкритим для нового вводу |
| AC-09 (US-01 authorization) | не-Owner-повідомлення мовчки ігнорується | unit + integration | перевірка `owner_telegram_id` відхиляє update; жоден рядок у `reminders` чи `source_snapshots` не записано; gateway не отримує жодного вихідного виклику |
| AC-10 (US-05 domain invariant) | snooze на вирішеному нагадуванні відхиляється | unit + integration | `SnoozeReminder` виявляє термінальний стан (`done` або `deleted`); стан незмінний; Owner отримує «вже вирішено, дія неможлива» |
| AC-11 (US-08 cross-context) | «Go to source» без публічного username показує контент inline замість посилання | unit + integration | перевірка доступності посилання повертає false, коли `chat_username = null`; Owner отримує inline-контент і примітку «пряме посилання недоступне»; жодного broken URL не надіслано |
| AC-12 (US-04 cross-context) | protected-content медіа спрацьовує з текстом і приміткою про обмеження | unit + integration | `is_media_protected = 1`; нагадування спрацьовує з текстовим вмістом і приміткою «медіа недоступне через обмеження джерела»; всі 4 кнопки присутні |
| AC-13 (US-01 setup gate) | захоплення блокується, якщо timezone не налаштований | integration | пересланe повідомлення отримано; рядок `awaiting_time` не створено; Owner перенаправлено до `/settings`; захоплення відновлюється після налаштування timezone |
| §6 NFR durability | pending-нагадування переживає рестарт сервісу і спрацьовує | integration | нагадування розкладено; процес зупинено і перезапущено; scheduler-тік спрацьовує в межах ±60 с від `scheduled_at` |

## Edge cases / error paths

- `awaiting_time`-промпт проігноровано 24 год → очікується: перехід у стан `expired`; Owner отримує сповіщення про закінчення терміну; жодного `scheduled_at` не записано
- crash під час `firing` (рядок завис у `firing` після рестарту) → очікується: scheduler re-fires на наступному тіку; дублікат придушено після підтвердження `delivered_at`; жодне нагадування не втрачається
- Telegram повертає 429 flood-wait під час burst → очікується: бот дотримується затримки flood-wait; не більше 10 вихідних повідомлень за будь-яку 60-секундну вікно
- snooze при snooze-промпті, коли всі quick-picks вже минули сьогодні → очікується: відображається тільки «Довільний час»; жодних минулих кнопок не показано
- пересланe повідомлення без тексту і без `media_file_id` → очікується: snapshot зберігає `null` для `message_text` і `media_file_id`; нагадування спрацьовує з fallback-приміткою «вміст недоступний»
- DB-помилка під час capture-транзакції → очікується: жодного часткового стану в БД; Owner отримує загальне повідомлення про помилку; жоден orphaned `source_snapshot`-рядок не залишається

## Test data

- **Seed-стратегія:** factory-функції `buildOwnerSettings`, `buildSourceSnapshot`, `buildReminder` (сигнатури у `data-model.md`; реалізації — `test/helpers/factories.ts`). PII guard: `owner_telegram_id: 123456789` (числовий placeholder, не реальне ім'я).
- **Integration dependency:** ephemeral реальний SQLite temp-файл (throwaway), `PRAGMA foreign_keys = ON` при відкритті з'єднання. Жодного мокованого сховища.
- **Cleanup boundary:** per-suite — temp DB-файл створюється у `beforeAll`, видаляється у `afterAll`; окремі тест-кейси скидають стан через rollback транзакції або factory-seeded fresh state.

## NFR validation (load)

- **NFR: p95 action response latency ≤ 2 с** → сценарій: 20 паралельних callback-запитів протягом 30 с розгону, 60 с стабільного навантаження; стверджуємо p95 bot-side response time ≤ 2 с та error rate = 0. Інструмент: той, що вже є у вашому репо, або напр. k6 / Locust.
- **NFR: fire accuracy ±60 с** → покрито integration-рядком `§6 NFR durability` вище; окремого load-сценарію не потребує.
- **NFR: anti-flood ≤ 10 повідомлень / 60 с** → покрито граничним випадком «Telegram 429 flood-wait» вище; окремого load-сценарію не потребує.
- **NFR: availability ≥ 99% / місяць** → зовнішній uptime-монітор (напр. UptimeRobot); поза межами тест-сьюту.

<!-- N/A: load-тести лише для p95 latency; інші числові NFR покриті integration + edge-case рядками. -->

## CI placement

- **На кожен PR:** unit, contract — швидкі сьюти без spin-up зовнішніх залежностей.
- **За розкладом / перед релізом:** integration, e2e, load — потребують ephemeral SQLite-провізіонування і більшого вікна виконання.
