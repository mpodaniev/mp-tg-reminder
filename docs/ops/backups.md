# SQLite backups (mp-tg-reminder)

The entire database (`/data/reminders.db`) lives on a single Fly volume
`reminders_data` (fly.toml, `[[mounts]]`). Losing the volume means losing all
reminders.

## What exists today

Fly.io takes automatic daily volume snapshots (retention ~5 days).
Verified (actually run on 2026-07-08):

    fly volumes list -a mp-tg-reminder
    fly volumes snapshots list <volume-id> -a mp-tg-reminder

Actual output (`fly volumes list -a mp-tg-reminder`, after cleanup — see below):

    ID                    │ STATE   │ NAME           │ SIZE │ REGION │ ZONE │ ENCRYPTED │ ATTACHED VM    │ CREATED AT
    vol_vxml1pyz36q128w4  │ created │ reminders_data │ 1GB  │ ams    │ e6bb │ true      │ d89523dc461108 │ 3 weeks ago

`fly volumes snapshots list vol_vxml1pyz36q128w4 -a mp-tg-reminder` (the working volume, ams):

    ID                      │ STATUS  │ STORED SIZE │ VOL SIZE │ CREATED AT   │ RETENTION DAYS
    vs_KK2wODQ3LeyHzDappg9j │ created │      34 MiB │  1.0 GiB │ 4 days ago   │              5
    vs_aXZyO9AbqPRSpOQRQPk  │ created │     1.4 KiB │  1.0 GiB │ 3 days ago   │              5
    vs_XKxmOolg3BYHOMJPab3e │ created │     1.4 KiB │  1.0 GiB │ 2 days ago   │              5
    vs_4O7XPB9yA86ckaYNObL4 │ created │     3.1 MiB │  1.0 GiB │ 1 day ago    │              5
    vs_v10pMY7b3Zjt2XDPgo3x │ created │     4.8 MiB │  1.0 GiB │ 12 hours ago │              5

    Total stored size: 42 MiB

Last confirmation that snapshots exist: **2026-07-08** (actual check via
`flyctl`, authenticated as `mpodaniev@gmail.com`).

**Historical note:** on the same day, the initial check found a second,
orphaned volume `vol_4ql6x1xq39kqjqgr` (region `fra`, not attached to any
machine, ~3 weeks old, still generating its own snapshots) — a leftover from a
previous deployment/region migration. Confirmed that the data there was not
needed, and the volume was destroyed (`fly volumes destroy
vol_4ql6x1xq39kqjqgr -a mp-tg-reminder`, 2026-07-08). The table and snapshots
above already reflect the post-deletion state.

## Restoring from a snapshot

    fly volumes create reminders_data --snapshot-id <snapshot-id> --region ams -a mp-tg-reminder

Then attach a new machine to the restored volume (fly.toml `[[mounts]]`).

To restore working data, use the snapshot from the volume
`vol_vxml1pyz36q128w4` (region `ams`) specifically — that's the one attached
to the active machine.

## Next step (not done, deliberately deferred)

Litestream replication to object storage (S3/R2) would give point-in-time
recovery instead of a daily snapshot. Revisit this if the bot becomes
mission-critical or the 5-day retention turns out to be insufficient.
