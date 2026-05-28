-- ===========================================================================
-- FIX: wallet_currencies PK (estaba como `code` única → impedía multi-user
-- y rompía el upsert con onConflict='user_id,code' que usa el sync).
--
-- Si tu push de divisas falla en silencio y al recargar las divisas/wallets
-- aparecen vacías, este es el fix.
--
-- Es idempotente — seguro de correr múltiples veces. Si ya corriste
-- migration_phase2.sql, este migration es un no-op.
-- ===========================================================================

-- Drop el PK viejo si existe (era solo `code`)
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'wallet_currencies'
      and constraint_name = 'wallet_currencies_pkey'
      and table_schema = 'public'
  ) then
    -- Solo drop si NO es ya el compuesto (chequeamos cuántas columnas tiene)
    if (
      select count(*)
      from information_schema.key_column_usage
      where table_name = 'wallet_currencies'
        and constraint_name = 'wallet_currencies_pkey'
        and table_schema = 'public'
    ) < 2 then
      alter table public.wallet_currencies drop constraint wallet_currencies_pkey;
    end if;
  end if;
end $$;

-- Add composite PK (user_id, code) — sólo si todavía no existe
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'wallet_currencies'
      and constraint_name = 'wallet_currencies_pkey'
      and table_schema = 'public'
  ) then
    alter table public.wallet_currencies
      add constraint wallet_currencies_pkey primary key (user_id, code);
  end if;
end $$;
