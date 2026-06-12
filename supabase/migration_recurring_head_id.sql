-- migration_recurring_head_id.sql
--
-- Adds `recurring_head_id` to public.tasks. Stores the id of the "mother"
-- task of a recurring chain — the mother has recurring_head_id === id
-- (self-reference); the children point to her id. Used as the persistent
-- anchor for the chain so renaming/editing the mother propagates to her
-- future children, and the chain identity survives even if the mother is
-- completed.
--
-- Safe to run multiple times (idempotent via IF NOT EXISTS).
-- After running this, the app's `migrateRecurringHeads()` action backfills
-- the field for existing recurring tasks on next mount.

alter table public.tasks
  add column if not exists recurring_head_id text;

-- Index para acelerar el lookup "todas las hijas de esta madre" que hace
-- la vista Recurrentes + el spawn. Sin esto, cuando hay miles de tasks
-- viejas, un full-scan por cada recurringHeadId arrastra.
create index if not exists idx_tasks_recurring_head
  on public.tasks(recurring_head_id)
  where recurring_head_id is not null;
