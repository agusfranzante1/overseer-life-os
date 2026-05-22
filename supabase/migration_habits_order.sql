-- Adds a sort_order column to habits so manual reordering from the UI
-- persists across sessions and devices. Existing rows get sequential values
-- based on created_at so they keep their current implicit order.

alter table public.habits
  add column if not exists sort_order integer;

-- Backfill: assign sequential sort_order to existing rows per user, in
-- created_at order. Safe to re-run because we only set rows where the
-- column is null.
with ordered as (
  select id, row_number() over (partition by user_id order by created_at, id) - 1 as rn
  from public.habits
  where sort_order is null
)
update public.habits h
set sort_order = ordered.rn
from ordered
where h.id = ordered.id;

create index if not exists habits_user_order_idx on public.habits(user_id, sort_order);
