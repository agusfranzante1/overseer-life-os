-- ===========================================================================
-- Overseer Life OS - Supabase Schema (Fase 1)
-- ===========================================================================
-- Como usar:
--   1. Crear proyecto en https://supabase.com
--   2. Abrir SQL Editor -> New query -> pegar TODO este archivo -> Run
--   3. Verificar en Table Editor que las tablas se crearon con RLS habilitada
-- ===========================================================================

-- Extensiones utiles
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------
-- Espejo de auth.users con info extra.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "profiles: select own" on public.profiles for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles for insert with check (auth.uid() = id);

-- Trigger para auto-crear el profile al firmar
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- APP SETTINGS (singleton por usuario)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text default 'es',
  sidebar_collapsed boolean default false,
  day_type text,
  active_section text default 'dashboard',
  chat_open boolean default false,
  metrics jsonb default '{}'::jsonb,
  ideal_schedule jsonb default '{}'::jsonb,
  schedule_order jsonb default '[]'::jsonb,
  nav_order jsonb default '[]'::jsonb,
  ai_provider text default 'off',
  anthropic_api_key text,
  anthropic_model text default 'claude-haiku-4-5',
  updated_at timestamptz default now()
);
alter table public.app_settings enable row level security;
create policy "app_settings: own" on public.app_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  icon text,
  description text,
  statuses jsonb not null default '[]'::jsonb,
  archived boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_projects_user on public.projects(user_id);
alter table public.projects enable row level security;
create policy "projects: own" on public.projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null,
  priority text not null default 'medium',
  importance text not null default 'medium',
  due_date date,
  energy_estimate integer,
  notes text,
  scheduled_for text,
  completed_at timestamptz,
  postponed_count integer default 0,
  category text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_tasks_user on public.tasks(user_id);
create index if not exists idx_tasks_project on public.tasks(project_id);
create index if not exists idx_tasks_due on public.tasks(due_date) where due_date is not null;
alter table public.tasks enable row level security;
create policy "tasks: own" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.subtasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null references public.tasks(id) on delete cascade,
  parent_id text references public.subtasks(id) on delete cascade,
  title text not null,
  completed boolean default false,
  status text not null default 'To Do',
  "order" integer default 0,
  notes text,
  priority text,
  created_at timestamptz default now()
);
create index if not exists idx_subtasks_task on public.subtasks(task_id);
create index if not exists idx_subtasks_parent on public.subtasks(parent_id);
alter table public.subtasks enable row level security;
create policy "subtasks: own" on public.subtasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- WALLET
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_currencies (
  -- PK compuesto: cada usuario tiene SU propio set de divisas. Si fuera
  -- sólo `code`, dos usuarios no podrían tener ambos "USD" — y el sync
  -- (upsert con onConflict='user_id,code') fallaría silenciosamente.
  code text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  name text not null,
  color text not null,
  primary key (user_id, code)
);
create index if not exists idx_currencies_user on public.wallet_currencies(user_id);
alter table public.wallet_currencies enable row level security;
create policy "wallet_currencies: own" on public.wallet_currencies for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.wallets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  icon text not null,
  currency_codes jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_wallets_user on public.wallets(user_id);
alter table public.wallets enable row level security;
create policy "wallets: own" on public.wallets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.wallet_transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  wallet_id text not null,
  currency_code text not null,
  amount numeric not null,
  label text not null,
  category text not null,
  date date not null,
  timestamp bigint not null,
  to_wallet_id text,
  to_currency_code text,
  to_amount numeric
);
create index if not exists idx_wallet_tx_user on public.wallet_transactions(user_id);
create index if not exists idx_wallet_tx_wallet on public.wallet_transactions(wallet_id);
alter table public.wallet_transactions enable row level security;
create policy "wallet_transactions: own" on public.wallet_transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.wallet_distribution (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  percentage numeric not null,
  color text not null
);
alter table public.wallet_distribution enable row level security;
create policy "wallet_distribution: own" on public.wallet_distribution for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.wallets_deleted (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet jsonb not null,
  transactions jsonb not null,
  deleted_at bigint not null
);
alter table public.wallets_deleted enable row level security;
create policy "wallets_deleted: own" on public.wallets_deleted for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- GYM
-- ---------------------------------------------------------------------------
create table if not exists public.gym_routines (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  day_label text not null,
  exercises jsonb not null default '[]'::jsonb
);
alter table public.gym_routines enable row level security;
create policy "gym_routines: own" on public.gym_routines for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.gym_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  name text not null,
  routine_id text,
  exercises jsonb not null default '[]'::jsonb,
  started_at timestamptz not null,
  ended_at timestamptz,
  notes text
);
create index if not exists idx_gym_sessions_user on public.gym_sessions(user_id);
create index if not exists idx_gym_sessions_date on public.gym_sessions(date);
alter table public.gym_sessions enable row level security;
create policy "gym_sessions: own" on public.gym_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.gym_weight_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  kg numeric not null,
  note text,
  created_at timestamptz default now()
);
create index if not exists idx_gym_weight_user on public.gym_weight_entries(user_id);
create unique index if not exists idx_gym_weight_user_date on public.gym_weight_entries(user_id, date);
alter table public.gym_weight_entries enable row level security;
create policy "gym_weight_entries: own" on public.gym_weight_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.gym_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weight_goal_kg numeric,
  gym_type text default 'home',
  phase text default 'maintenance',
  current_exercise_name text,
  active_session jsonb,
  updated_at timestamptz default now()
);
alter table public.gym_config enable row level security;
create policy "gym_config: own" on public.gym_config for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- TRADING
-- ---------------------------------------------------------------------------
create table if not exists public.trading_firms (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  rules jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz default now()
);
alter table public.trading_firms enable row level security;
create policy "trading_firms: own" on public.trading_firms for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.trading_accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  firm_id text not null references public.trading_firms(id) on delete cascade,
  alias text not null,
  account_size numeric not null,
  evaluation_cost numeric not null,
  status text not null,
  start_date date not null,
  closed_date date,
  notes text,
  mode text,
  max_risk_per_trade_pct numeric,
  max_daily_loss_pct numeric,
  max_daily_trades integer,
  target_payout_amount numeric,
  created_at timestamptz default now()
);
create index if not exists idx_trading_accounts_user on public.trading_accounts(user_id);
alter table public.trading_accounts enable row level security;
create policy "trading_accounts: own" on public.trading_accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.trading_strategies (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  instrument text not null,
  timeframe text not null,
  session text not null,
  risk_per_trade_pct numeric,
  target_rrr numeric,
  rules text,
  active boolean default true,
  description text,
  created_at timestamptz default now()
);
alter table public.trading_strategies enable row level security;
create policy "trading_strategies: own" on public.trading_strategies for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.trading_trades (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null references public.trading_accounts(id) on delete cascade,
  strategy_id text not null references public.trading_strategies(id) on delete cascade,
  date_time timestamptz not null,
  exit_date_time timestamptz,
  instrument text not null,
  direction text not null,
  planned_pnl numeric not null,
  actual_pnl numeric not null,
  r_multiple_strategy numeric,
  r_multiple_actual numeric,
  mood_before text,
  mood_after text,
  notes text,
  screenshot_url text,
  created_at timestamptz default now()
);
create index if not exists idx_trading_trades_user on public.trading_trades(user_id);
create index if not exists idx_trading_trades_account on public.trading_trades(account_id);
create index if not exists idx_trading_trades_strategy on public.trading_trades(strategy_id);
alter table public.trading_trades enable row level security;
create policy "trading_trades: own" on public.trading_trades for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.trading_errors (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id text,
  strategy_id text not null,
  account_id text not null,
  type text not null,
  description text not null,
  screenshot_url text,
  created_at timestamptz default now()
);
alter table public.trading_errors enable row level security;
create policy "trading_errors: own" on public.trading_errors for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.trading_payouts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null references public.trading_accounts(id) on delete cascade,
  amount numeric not null,
  date date not null,
  note text,
  created_at timestamptz default now()
);
alter table public.trading_payouts enable row level security;
create policy "trading_payouts: own" on public.trading_payouts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.trading_emotional (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  mood text not null,
  energy_before integer not null,
  energy_after integer,
  description text not null,
  tags jsonb default '[]'::jsonb,
  trade_ids jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);
alter table public.trading_emotional enable row level security;
create policy "trading_emotional: own" on public.trading_emotional for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- FOOD
-- ---------------------------------------------------------------------------
-- Estructura jerarquica guardada en JSONB para Fase 1.
create table if not exists public.food_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stages jsonb not null default '[]'::jsonb,
  current_stage_id text,
  shopping jsonb not null default '[]'::jsonb,
  fixed_costs jsonb not null default '[]'::jsonb,
  notes text not null default '',
  updated_at timestamptz default now()
);
alter table public.food_data enable row level security;
create policy "food_data: own" on public.food_data for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- WALLET RECURRING EXPENSES (suscripciones / pagos recurrentes)
-- ---------------------------------------------------------------------------
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
  last_applied_year_month text,
  is_subscription boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists wallet_recurring_user_idx on public.wallet_recurring_expenses(user_id, active, day_of_month);
alter table public.wallet_recurring_expenses enable row level security;
create policy "wallet_recurring_expenses: own" on public.wallet_recurring_expenses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- APP PREFERENCES (singleton — sidebar order, language, timezone, schedule,
-- AI settings, etc. Sincronizado entre dispositivos.)
-- ---------------------------------------------------------------------------
create table if not exists public.app_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.app_preferences enable row level security;
create policy "app_preferences: own" on public.app_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- HEALTH
-- ---------------------------------------------------------------------------
create table if not exists public.health_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  steps integer default 0,
  sleep_minutes integer default 0,
  sleep_start timestamptz,
  sleep_end timestamptz,
  resting_hr integer,
  hrv numeric,
  source text default 'manual',
  synced_at bigint not null,
  primary key (user_id, date)
);
alter table public.health_snapshots enable row level security;
create policy "health_snapshots: own" on public.health_snapshots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.health_baseline (
  user_id uuid primary key references auth.users(id) on delete cascade,
  resting_hr numeric,
  hrv numeric,
  sleep_goal_minutes integer default 480,
  last_sync_at bigint,
  updated_at timestamptz default now()
);
alter table public.health_baseline enable row level security;
create policy "health_baseline: own" on public.health_baseline for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- HABITS
-- ---------------------------------------------------------------------------
create table if not exists public.habits (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null,
  color text not null,
  target_days jsonb default '[]'::jsonb,
  completed_dates jsonb default '[]'::jsonb,
  category text not null,
  created_at date default current_date
);
create index if not exists idx_habits_user on public.habits(user_id);
alter table public.habits enable row level security;
create policy "habits: own" on public.habits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- CHAT
-- ---------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  timestamp text not null,
  action_card jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_chat_user_time on public.chat_messages(user_id, created_at desc);
alter table public.chat_messages enable row level security;
create policy "chat_messages: own" on public.chat_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- GOOGLE CALENDAR (preferencias del lado app; los tokens viven en filesystem)
-- ---------------------------------------------------------------------------
create table if not exists public.gcal_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  connected boolean default false,
  calendars jsonb default '[]'::jsonb,
  visible_ids jsonb default '[]'::jsonb,
  view text default 'month',
  show_side_rail boolean default true,
  hide_night boolean default false,
  hide_start integer default 0,
  hide_end integer default 7
);
alter table public.gcal_preferences enable row level security;
create policy "gcal_preferences: own" on public.gcal_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RAW BACKUP (para datos no migrados aun por campo, JSON crudo)
-- ---------------------------------------------------------------------------
create table if not exists public.raw_backups (
  user_id uuid not null references auth.users(id) on delete cascade,
  store_key text not null,
  payload jsonb not null,
  uploaded_at timestamptz default now(),
  primary key (user_id, store_key)
);
alter table public.raw_backups enable row level security;
create policy "raw_backups: own" on public.raw_backups for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===========================================================================
-- Listo. Si llegaste hasta aca sin errores, el schema esta creado.
-- ===========================================================================
