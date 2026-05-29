-- ===========================================================================
-- TRADING SCALING CONFIG — singleton por usuario.
--
-- Guarda la config del Sistema de Escalado del usuario:
--   • distribución de payouts (% nuevas cuentas / salario / capital)
--   • grupos de diversificación (Londres, NY, etc.)
--   • milestones (1 payout → 3 ctas, 3 payouts → 10 ctas, etc.)
--   • meta de capital real
--
-- Todo va en un único JSONB blob para evolucionar la shape sin migrations.
-- ===========================================================================

create table if not exists public.trading_scaling_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.trading_scaling_config enable row level security;

drop policy if exists "trading_scaling_config: own" on public.trading_scaling_config;
create policy "trading_scaling_config: own" on public.trading_scaling_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
