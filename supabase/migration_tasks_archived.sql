-- Adds archived_at to the tasks table to support the "Papelera de completadas"
-- (recycle bin) workflow: completed tasks are moved to the archive the day
-- after completion (in the user's timezone) instead of being hard-deleted.
-- Archived tasks stay in the DB but are hidden from normal views.
--
-- Run after the initial schema.sql.

alter table public.tasks
  add column if not exists archived_at timestamptz;

create index if not exists tasks_archived_idx on public.tasks(user_id, archived_at)
  where archived_at is not null;
