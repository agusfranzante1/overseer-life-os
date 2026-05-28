-- ===========================================================================
-- FIX: wallet_currencies PK — dos problemas históricos a resolver de una:
--
--   1) schema.sql original definía el PK como `code` (sólo una columna)
--      → impedía multi-user y rompía el upsert con onConflict='user_id,code'
--
--   2) migration_phase2.sql arreglaba lo anterior PERO creaba el PK como
--      `DEFERRABLE INITIALLY IMMEDIATE` → Postgres no soporta ON CONFLICT
--      con constraints deferrable y tira:
--      "ON CONFLICT does not support deferrable unique constraints/exclusion
--       constraints as arbiters"
--
-- Este migration siempre dropea el PK actual y lo recrea NO-deferrable.
-- Es idempotente — seguro de correr múltiples veces.
-- ===========================================================================

-- Drop el PK actual (cualquier variante: code-only o composite, deferrable o no)
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

-- Recrear el PK compuesto SIN deferrable (necesario para ON CONFLICT)
alter table public.wallet_currencies
  add constraint wallet_currencies_pkey primary key (user_id, code);

-- Asegurar el index por user_id (existía desde schema.sql, pero por las dudas)
create index if not exists idx_currencies_user on public.wallet_currencies(user_id);
