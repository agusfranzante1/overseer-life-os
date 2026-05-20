-- Phase 3b (health) + Phase 4 (chat + food)
-- Run in Supabase SQL Editor.

-- ─── HEALTH SNAPSHOTS (one row per user per day) ──────────────────────────────

create table if not exists health_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,                         -- YYYY-MM-DD local
  steps int not null default 0,
  sleep_minutes int not null default 0,
  sleep_start text,                            -- ISO datetime
  sleep_end text,                              -- ISO datetime
  resting_hr int,
  hrv numeric,
  source text not null default 'manual',       -- 'shortcut' | 'manual'
  synced_at bigint not null,
  primary key (user_id, date)
);

create index if not exists health_snapshots_user_date_idx on health_snapshots(user_id, date desc);

alter table health_snapshots enable row level security;

drop policy if exists "Users manage own health snapshots" on health_snapshots;
create policy "Users manage own health snapshots" on health_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── HEALTH CONFIG (singleton per user) ───────────────────────────────────────

create table if not exists health_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sleep_goal_minutes int not null default 480,
  updated_at timestamptz default now()
);

alter table health_config enable row level security;

drop policy if exists "Users manage own health config" on health_config;
create policy "Users manage own health config" on health_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── CHAT MESSAGES ────────────────────────────────────────────────────────────

create table if not exists chat_messages (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,                          -- 'user' | 'assistant'
  content text not null,
  timestamp text not null,
  action_card jsonb
);

create index if not exists chat_messages_user_ts_idx on chat_messages(user_id, timestamp);

alter table chat_messages enable row level security;

drop policy if exists "Users manage own chat messages" on chat_messages;
create policy "Users manage own chat messages" on chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── FOOD DATA (singleton per user, JSONB blobs for nested data) ──────────────

create table if not exists food_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stages jsonb not null default '[]'::jsonb,
  shopping jsonb not null default '[]'::jsonb,
  fixed_costs jsonb not null default '[]'::jsonb,
  current_stage_id text,
  updated_at timestamptz default now()
);

alter table food_data enable row level security;

drop policy if exists "Users manage own food data" on food_data;
create policy "Users manage own food data" on food_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
