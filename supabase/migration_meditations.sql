-- ===========================================================================
-- MEDITACIONES — biblioteca de meditaciones / prácticas de respiración.
--
-- Una fila por meditación (título / guión / categoría / favorito / audio).
-- Merge multi-device: LWW por updated_at + tombstones (tabla genérica
-- deleted_rows). Payload JSONB con la meditación entera para forward-compat
-- si sumamos campos.
--
-- Correr UNA vez en el SQL editor de Supabase.
-- ===========================================================================

create table if not exists public.meditation_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists meditation_entries_user_idx
  on public.meditation_entries(user_id, updated_at desc);

alter table public.meditation_entries enable row level security;

drop policy if exists meditation_entries_select on public.meditation_entries;
create policy meditation_entries_select on public.meditation_entries
  for select using (auth.uid() = user_id);

drop policy if exists meditation_entries_insert on public.meditation_entries;
create policy meditation_entries_insert on public.meditation_entries
  for insert with check (auth.uid() = user_id);

drop policy if exists meditation_entries_update on public.meditation_entries;
create policy meditation_entries_update on public.meditation_entries
  for update using (auth.uid() = user_id);

drop policy if exists meditation_entries_delete on public.meditation_entries;
create policy meditation_entries_delete on public.meditation_entries
  for delete using (auth.uid() = user_id);
