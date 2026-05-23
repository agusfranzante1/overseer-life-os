-- SPI: Sistema de Progreso Infinito
--
-- Stores weekly planning sessions. The full session shape (template values,
-- generated tasks, checklist state, etc.) is stored as JSONB to keep the
-- schema small and forward-compatible with template evolution.
--
-- Why JSONB instead of normalized tables:
--   - Sessions are written/read as a unit; we never query "all tasks across
--     all sessions" from SQL — that's done in-memory by the client.
--   - Template structure will evolve over time. JSONB means no schema
--     migration needed when we add new fields.

create table if not exists public.spi_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  -- Full session payload (matches the SPISession TypeScript interface).
  payload jsonb not null,
  unique (user_id, week_start_date)
);

-- Fast lookup by user, ordered by week.
create index if not exists spi_sessions_user_week_idx
  on public.spi_sessions(user_id, week_start_date desc);

-- RLS — same pattern as habits / tasks tables.
alter table public.spi_sessions enable row level security;

drop policy if exists spi_sessions_select on public.spi_sessions;
create policy spi_sessions_select on public.spi_sessions
  for select using (auth.uid() = user_id);

drop policy if exists spi_sessions_insert on public.spi_sessions;
create policy spi_sessions_insert on public.spi_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists spi_sessions_update on public.spi_sessions;
create policy spi_sessions_update on public.spi_sessions
  for update using (auth.uid() = user_id);

drop policy if exists spi_sessions_delete on public.spi_sessions;
create policy spi_sessions_delete on public.spi_sessions
  for delete using (auth.uid() = user_id);
