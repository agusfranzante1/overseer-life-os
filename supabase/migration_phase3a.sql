-- Phase 3a: habits + gym (body weight + config only — sessions/routines come in 3b)
-- Run in Supabase SQL Editor.

-- ─── HABITS ───────────────────────────────────────────────────────────────────

create table if not exists habits (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null,
  color text not null,
  target_days int[] not null default '{}',
  completed_dates text[] not null default '{}',
  category text not null,
  created_at text not null
);

create index if not exists habits_user_id_idx on habits(user_id);

alter table habits enable row level security;

drop policy if exists "Users manage own habits" on habits;
create policy "Users manage own habits" on habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── GYM: WEIGHT ENTRIES ──────────────────────────────────────────────────────

create table if not exists gym_weight_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  kg numeric not null,
  note text,
  created_at text not null
);

create index if not exists gym_weight_user_date_idx on gym_weight_entries(user_id, date desc);

alter table gym_weight_entries enable row level security;

drop policy if exists "Users manage own weight entries" on gym_weight_entries;
create policy "Users manage own weight entries" on gym_weight_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── GYM: CONFIG (singleton per user) ─────────────────────────────────────────

create table if not exists gym_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gym_type text not null default 'home',
  phase text not null default 'maintenance',
  weight_goal_kg numeric,
  updated_at timestamptz default now()
);

alter table gym_config enable row level security;

drop policy if exists "Users manage own gym config" on gym_config;
create policy "Users manage own gym config" on gym_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
