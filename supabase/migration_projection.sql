-- Proyección: strategic planning above the weekly SPI ritual.
-- Stores annual / quarterly / monthly plans. Like spi_sessions, the
-- full plan shape lives in a JSONB payload column for forward compat
-- (templates evolve, fields are added, etc.).

create table if not exists public.projection_plans (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  level text not null check (level in ('year', 'quarter', 'month')),
  -- Canonical period key:
  --   year:    'YYYY'         (e.g. '2026')
  --   quarter: 'YYYY-QN'      (e.g. '2026-Q1')
  --   month:   'YYYY-MM'      (e.g. '2026-03')
  period_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  payload jsonb not null,
  -- One plan per (user, level, period). Enforces uniqueness.
  unique (user_id, level, period_key)
);

create index if not exists projection_plans_user_idx
  on public.projection_plans(user_id, level, period_key desc);

alter table public.projection_plans enable row level security;

drop policy if exists projection_plans_select on public.projection_plans;
create policy projection_plans_select on public.projection_plans
  for select using (auth.uid() = user_id);

drop policy if exists projection_plans_insert on public.projection_plans;
create policy projection_plans_insert on public.projection_plans
  for insert with check (auth.uid() = user_id);

drop policy if exists projection_plans_update on public.projection_plans;
create policy projection_plans_update on public.projection_plans
  for update using (auth.uid() = user_id);

drop policy if exists projection_plans_delete on public.projection_plans;
create policy projection_plans_delete on public.projection_plans
  for delete using (auth.uid() = user_id);
