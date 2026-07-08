# Бекапи SQLite (mp-tg-reminder)

Уся база (`/data/reminders.db`) живе на одному Fly-волюмі `reminders_data`
(fly.toml, `[[mounts]]`). Втрата волюма = втрата всіх нагадувань.

## Що є зараз

Fly.io робить автоматичні щоденні снапшоти волюмів (ретеншен ~5 днів).
Перевірка (реально виконана 2026-07-08):

    fly volumes list -a mp-tg-reminder
    fly volumes snapshots list <volume-id> -a mp-tg-reminder

Реальний вивід (`fly volumes list -a mp-tg-reminder`):

    ID                    │ STATE   │ NAME           │ SIZE │ REGION │ ZONE │ ENCRYPTED │ ATTACHED VM    │ CREATED AT
    vol_4ql6x1xq39kqjqgr  │ created │ reminders_data │ 1GB  │ fra    │ eb8f │ true      │                │ 3 weeks ago
    vol_vxml1pyz36q128w4  │ created │ reminders_data │ 1GB  │ ams    │ e6bb │ true      │ d89523dc461108 │ 3 weeks ago

**Важливо:** існує два волюми з іменем `reminders_data` в різних регіонах.
`primary_region` у `fly.toml` — `ams`, і саме волюм `vol_vxml1pyz36q128w4`
(регіон `ams`) прив'язаний до активної машини (`d89523dc461108`) — це
робочий волюм із живими даними. Волюм `vol_4ql6x1xq39kqjqgr` (регіон `fra`)
наразі не прив'язаний до жодної машини — схоже на залишок від попереднього
розгортання/міграції регіону. Його варто перевірити вручну (чи можна
видалити) окремим завданням — це поза межами цієї задачі, лише документуємо
факт.

Снапшоти є для обох волюмів (по 5 штук, щоденні, ретеншен 5 днів —
відповідає дефолтній політиці Fly.io):

`fly volumes snapshots list vol_vxml1pyz36q128w4 -a mp-tg-reminder` (робочий волюм, ams):

    ID                      │ STATUS  │ STORED SIZE │ VOL SIZE │ CREATED AT   │ RETENTION DAYS
    vs_KK2wODQ3LeyHzDappg9j │ created │      34 MiB │  1.0 GiB │ 4 days ago   │              5
    vs_aXZyO9AbqPRSpOQRQPk  │ created │     1.4 KiB │  1.0 GiB │ 3 days ago   │              5
    vs_XKxmOolg3BYHOMJPab3e │ created │     1.4 KiB │  1.0 GiB │ 2 days ago   │              5
    vs_4O7XPB9yA86ckaYNObL4 │ created │     3.1 MiB │  1.0 GiB │ 1 day ago    │              5
    vs_v10pMY7b3Zjt2XDPgo3x │ created │     4.8 MiB │  1.0 GiB │ 12 hours ago │              5

    Total stored size: 42 MiB

`fly volumes snapshots list vol_4ql6x1xq39kqjqgr -a mp-tg-reminder` (орфанований волюм, fra):

    ID                      │ STATUS  │ STORED SIZE │ VOL SIZE │ CREATED AT   │ RETENTION DAYS
    vs_4o6nlkqg9x9Hk8ZJDnBV │ created │      33 MiB │  1.0 GiB │ 4 days ago   │              5
    vs_e63eQNxM2z2hG58K23m  │ created │     1.6 KiB │  1.0 GiB │ 3 days ago   │              5
    vs_bNMok9KAJ1JtgqkpQoX  │ created │     1.6 KiB │  1.0 GiB │ 2 days ago   │              5
    vs_56anNBVDXxXh2x4oQo8  │ created │     1.6 KiB │  1.0 GiB │ 1 day ago    │              5
    vs_KJy0mYNAQXQczl6wKqX6 │ created │     1.6 KiB │  1.0 GiB │ 12 hours ago │              5

    Total stored size: 33 MiB

Останнє підтвердження, що снапшоти існують: **2026-07-08** (реальна перевірка
через `flyctl`, автентифікований як `mpodaniev@gmail.com`) — снапшоти
знайдено для обох волюмів, по 5 штук кожен.

## Відновлення зі снапшота

    fly volumes create reminders_data --snapshot-id <snapshot-id> --region ams -a mp-tg-reminder

Потім прив'язати нову машину до відновленого волюма (fly.toml `[[mounts]]`).

Для відновлення робочих даних використовувати снапшот саме волюма
`vol_vxml1pyz36q128w4` (регіон `ams`) — це той, що прив'язаний до активної
машини.

## Подальший крок (не зроблено, свідомо відкладено)

Litestream-реплікація в об'єктне сховище (S3/R2) дала б point-in-time
відновлення замість щоденної точки. Повернутися до цього, якщо бот стане
критичним або ретеншену 5 днів виявиться замало.
