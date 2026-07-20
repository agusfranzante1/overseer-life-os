-- ===========================================================================
-- MY JOURNAL — diario personal de aprendizajes.
--
-- Una fila por entrada (title/body/date + timestamps). Merge multi-device:
-- LWW por updated_at + tombstones (tabla genérica deleted_rows). Payload JSONB
-- con la entrada entera para forward-compat si sumamos campos.
--
-- Correr UNA vez en el SQL editor de Supabase.
-- ===========================================================================

create table if not exists public.journal_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists journal_entries_user_idx
  on public.journal_entries(user_id, entry_date desc);

alter table public.journal_entries enable row level security;

drop policy if exists journal_entries_select on public.journal_entries;
create policy journal_entries_select on public.journal_entries
  for select using (auth.uid() = user_id);

drop policy if exists journal_entries_insert on public.journal_entries;
create policy journal_entries_insert on public.journal_entries
  for insert with check (auth.uid() = user_id);

drop policy if exists journal_entries_update on public.journal_entries;
create policy journal_entries_update on public.journal_entries
  for update using (auth.uid() = user_id);

drop policy if exists journal_entries_delete on public.journal_entries;
create policy journal_entries_delete on public.journal_entries
  for delete using (auth.uid() = user_id);
