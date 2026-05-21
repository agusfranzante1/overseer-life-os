-- Sleep stage breakdown columns for health_snapshots.
-- Run after migration_health_webhook.sql.

alter table health_snapshots
  add column if not exists sleep_in_bed_minutes int,
  add column if not exists sleep_core_minutes int,
  add column if not exists sleep_deep_minutes int,
  add column if not exists sleep_rem_minutes int,
  add column if not exists sleep_awake_minutes int;
