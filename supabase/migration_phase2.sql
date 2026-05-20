-- ===========================================================================
-- Overseer Life OS — Migration Phase 2
-- ===========================================================================
-- Ejecutar en SQL Editor de Supabase ANTES de activar el sync de wallets.
-- Es seguro correr multiples veces (idempotente).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Fix 1: wallet_currencies PK
-- El PK original era solo `code` (texto), lo que causaria conflicto entre
-- usuarios que tengan la misma divisa (USD, EUR, ARS).
-- Lo cambiamos a PK compuesto (user_id, code).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'wallet_currencies'
      and constraint_name = 'wallet_currencies_pkey'
      and table_schema = 'public'
  ) then
    alter table public.wallet_currencies drop constraint wallet_currencies_pkey;
  end if;
end $$;

alter table public.wallet_currencies
  add constraint wallet_currencies_pkey primary key (user_id, code)
  deferrable initially immediate;

-- Tambien necesitamos un index en user_id (ya existe pero por las dudas)
create index if not exists idx_currencies_user on public.wallet_currencies(user_id);

-- ---------------------------------------------------------------------------
-- Fix 2: wallet_distribution → wallet_config
-- Los IDs de distribution son fijos ('d1'-'d4'), lo que causaria conflicto
-- de PK entre usuarios. Reemplazamos la tabla por un singleton JSONB.
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  distribution jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);
alter table public.wallet_config enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'wallet_config' and policyname = 'wallet_config: own'
  ) then
    execute 'create policy "wallet_config: own" on public.wallet_config for all using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  end if;
end $$;

-- La tabla wallet_distribution original se puede dejar vacia (no la usamos mas).
-- Si queres limpiarla: drop table if exists public.wallet_distribution;

-- ===========================================================================
-- Listo.
-- ===========================================================================
