# Бекапи SQLite (mp-tg-reminder)

Уся база (`/data/reminders.db`) живе на одному Fly-волюмі `reminders_data`
(fly.toml, `[[mounts]]`). Втрата волюма = втрата всіх нагадувань.

## Що є зараз

Fly.io робить автоматичні щоденні снапшоти волюмів (ретеншен ~5 днів).
Перевірка (реально виконана 2026-07-08):

    fly volumes list -a mp-tg-reminder
    fly volumes snapshots list <volume-id> -a mp-tg-reminder

Реальний вивід (`fly volumes list -a mp-tg-reminder`, після прибирання — див. нижче):

    ID                    │ STATE   │ NAME           │ SIZE │ REGION │ ZONE │ ENCRYPTED │ ATTACHED VM    │ CREATED AT
    vol_vxml1pyz36q128w4  │ created │ reminders_data │ 1GB  │ ams    │ e6bb │ true      │ d89523dc461108 │ 3 weeks ago

`fly volumes snapshots list vol_vxml1pyz36q128w4 -a mp-tg-reminder` (робочий волюм, ams):

    ID                      │ STATUS  │ STORED SIZE │ VOL SIZE │ CREATED AT   │ RETENTION DAYS
    vs_KK2wODQ3LeyHzDappg9j │ created │      34 MiB │  1.0 GiB │ 4 days ago   │              5
    vs_aXZyO9AbqPRSpOQRQPk  │ created │     1.4 KiB │  1.0 GiB │ 3 days ago   │              5
    vs_XKxmOolg3BYHOMJPab3e │ created │     1.4 KiB │  1.0 GiB │ 2 days ago   │              5
    vs_4O7XPB9yA86ckaYNObL4 │ created │     3.1 MiB │  1.0 GiB │ 1 day ago    │              5
    vs_v10pMY7b3Zjt2XDPgo3x │ created │     4.8 MiB │  1.0 GiB │ 12 hours ago │              5

    Total stored size: 42 MiB

Останнє підтвердження, що снапшоти існують: **2026-07-08** (реальна перевірка
через `flyctl`, автентифікований як `mpodaniev@gmail.com`).

**Історична примітка:** цього ж дня при первинній перевірці був знайдений
другий, орфанований волюм `vol_4ql6x1xq39kqjqgr` (регіон `fra`, не
прикріплений до жодної машини, ~3 тижні існував, продовжував генерувати власні
снапшоти) — залишок попереднього розгортання/міграції регіону. Підтверджено,
що дані там не потрібні, і волюм видалено (`fly volumes destroy
vol_4ql6x1xq39kqjqgr -a mp-tg-reminder`, 2026-07-08). Таблиця й снапшоти вище
вже відображають стан після видалення.

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
