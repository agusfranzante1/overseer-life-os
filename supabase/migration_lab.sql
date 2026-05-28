-- Laboratorio: ejercicios mentales/emocionales con sesiones guardadas.
-- Cada sesión es un ejercicio corrido por el usuario (creencias, emociones,
-- pensamientos, identidad, problemas, inercia). El payload guarda la sesión
-- entera para forward-compat con templates que evolucionan.

create table if not exists public.lab_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_key text not null,
  category_key text not null,
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  /** Si la sesión fue lanzada desde un SPI semanal, link de vuelta. */
  spi_session_id text,
  payload jsonb not null
);

create index if not exists lab_sessions_user_idx
  on public.lab_sessions(user_id, updated_at desc);

create index if not exists lab_sessions_category_idx
  on public.lab_sessions(user_id, category_key, updated_at desc);

create index if not exists lab_sessions_spi_idx
  on public.lab_sessions(user_id, spi_session_id)
  where spi_session_id is not null;

alter table public.lab_sessions enable row level security;

drop policy if exists lab_sessions_select on public.lab_sessions;
create policy lab_sessions_select on public.lab_sessions
  for select using (auth.uid() = user_id);

drop policy if exists lab_sessions_insert on public.lab_sessions;
create policy lab_sessions_insert on public.lab_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists lab_sessions_update on public.lab_sessions;
create policy lab_sessions_update on public.lab_sessions
  for update using (auth.uid() = user_id);

drop policy if exists lab_sessions_delete on public.lab_sessions;
create policy lab_sessions_delete on public.lab_sessions
  for delete using (auth.uid() = user_id);
