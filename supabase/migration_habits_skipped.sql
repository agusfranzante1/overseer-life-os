-- Habits: add `skipped_dates` column so days the user marked as N/A
-- ("no entreno los domingos", "journal solo entre semana") are excluded
-- from the daily completion average — they neither count for nor against.

alter table public.habits
  add column if not exists skipped_dates text[] default '{}'::text[];
