-- ===========================================================================
-- ENLACES / FAVORITOS — accesos rápidos del sidebar (chats de ChatGPT, docs…).
--
-- Lista chica y ordenada → se guarda como UNA fila singleton por usuario, con
-- el array entero en JSONB (patrón food_data). Merge: LWW por updated_at +
-- blindaje anti-wipe (si el local está vacío no pisa un remoto con datos).
--
-- Correr UNA vez en el SQL editor de Supabase.
-- ===========================================================================

create table if not exists public.favorites_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  favorites jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.favorites_data enable row level security;

drop policy if exists favorites_data_select on public.favorites_data;
create policy favorites_data_select on public.favorites_data
  for select using (auth.uid() = user_id);

drop policy if exists favorites_data_insert on public.favorites_data;
create policy favorites_data_insert on public.favorites_data
  for insert with check (auth.uid() = user_id);

drop policy if exists favorites_data_update on public.favorites_data;
create policy favorites_data_update on public.favorites_data
  for update using (auth.uid() = user_id);

drop policy if exists favorites_data_delete on public.favorites_data;
create policy favorites_data_delete on public.favorites_data
  for delete using (auth.uid() = user_id);
