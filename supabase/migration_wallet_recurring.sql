-- ===========================================================================
-- WALLET RECURRING EXPENSES — suscripciones / pagos recurrentes.
--
-- Cada row representa UN gasto recurrente (ej: "Netflix $15 día 5"). El
-- procesador en el cliente revisa estos rows en cada mount y crea la
-- transacción correspondiente en `wallet_transactions` si todavía no fue
-- aplicada este mes. El campo `last_applied_year_month` evita doble-cargo.
-- ===========================================================================

create table if not exists public.wallet_recurring_expenses (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id text not null,
  currency_code text not null,
  amount numeric not null,
  label text not null,
  category text not null default 'Suscripción',
  day_of_month integer not null check (day_of_month between 1 and 28),
  active boolean not null default true,
  start_date date not null,
  end_date date,
  last_applied_year_month text,                  -- 'YYYY-MM'
  is_subscription boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists wallet_recurring_user_idx
  on public.wallet_recurring_expenses(user_id, active, day_of_month);

alter table public.wallet_recurring_expenses enable row level security;

drop policy if exists "wallet_recurring_expenses: own" on public.wallet_recurring_expenses;
create policy "wallet_recurring_expenses: own" on public.wallet_recurring_expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
