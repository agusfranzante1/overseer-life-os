-- ===========================================================================
-- TRADING BACKTESTS — hojas de backtesting de estrategias.
--
-- Cada row representa UNA hoja (BacktestSet) entera: columnas configurables
-- + filas de trades viven dentro del payload JSONB (mismo patrón que
-- `mindmaps` — una hoja típica tiene decenas/cientos de filas, no vale la
-- pena normalizar). Merge multi-device: LWW por updated_at + tombstones.
--
-- Correr UNA vez en el SQL editor de Supabase.
-- ===========================================================================

create table if not exists public.trading_backtests (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists trading_backtests_user_idx
  on public.trading_backtests(user_id, updated_at desc);

alter table public.trading_backtests enable row level security;

drop policy if exists trading_backtests_select on public.trading_backtests;
create policy trading_backtests_select on public.trading_backtests
  for select using (auth.uid() = user_id);

drop policy if exists trading_backtests_insert on public.trading_backtests;
create policy trading_backtests_insert on public.trading_backtests
  for insert with check (auth.uid() = user_id);

drop policy if exists trading_backtests_update on public.trading_backtests;
create policy trading_backtests_update on public.trading_backtests
  for update using (auth.uid() = user_id);

drop policy if exists trading_backtests_delete on public.trading_backtests;
create policy trading_backtests_delete on public.trading_backtests
  for delete using (auth.uid() = user_id);
