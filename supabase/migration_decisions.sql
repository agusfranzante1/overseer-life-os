-- ===========================================================================
-- DECISIONES — el registro de las decisiones tomadas y de cómo salieron.
--
-- Una fila por decisión (texto, resultado, veredicto, ⭐, proyecto + fecha y
-- timestamps). Merge multi-device: LWW por updated_at + tombstones (la tabla
-- genérica deleted_rows). Payload JSONB con la decisión entera para
-- forward-compat si sumamos campos.
--
-- Correr UNA vez en el SQL editor de Supabase.
-- ===========================================================================

create table if not exists public.decisions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists decisions_user_idx
  on public.decisions(user_id, decision_date desc);

alter table public.decisions enable row level security;

drop policy if exists decisions_select on public.decisions;
create policy decisions_select on public.decisions
  for select using (auth.uid() = user_id);

drop policy if exists decisions_insert on public.decisions;
create policy decisions_insert on public.decisions
  for insert with check (auth.uid() = user_id);

drop policy if exists decisions_update on public.decisions;
create policy decisions_update on public.decisions
  for update using (auth.uid() = user_id);

drop policy if exists decisions_delete on public.decisions;
create policy decisions_delete on public.decisions
  for delete using (auth.uid() = user_id);
