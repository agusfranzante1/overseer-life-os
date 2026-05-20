-- Per-user webhook token for iOS Shortcut → health_snapshots ingestion.
-- Run after migration_phase3b_4.sql.

alter table health_config
  add column if not exists webhook_token text;

create unique index if not exists health_config_webhook_token_idx
  on health_config(webhook_token)
  where webhook_token is not null;
