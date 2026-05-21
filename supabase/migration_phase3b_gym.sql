-- Phase 3b: Gym routines + sessions (exercises and sets stored as JSONB blobs
-- inside each parent row, since they are nested and never queried via SQL).
-- Run after migration_phase3a.sql.

-- ─── GYM ROUTINES ─────────────────────────────────────────────────────────────

create table if not exists gym_routines (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  day_label text not null default '',
  exercises jsonb not null default '[]'::jsonb,    -- RoutineExercise[]
  created_at timestamptz default now()
);

create index if not exists gym_routines_user_idx on gym_routines(user_id);

alter table gym_routines enable row level security;

drop policy if exists "Users manage own routines" on gym_routines;
create policy "Users manage own routines" on gym_routines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── GYM SESSIONS ─────────────────────────────────────────────────────────────

create table if not exists gym_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,                              -- YYYY-MM-DD
  name text not null,
  routine_id text,                                 -- soft ref to gym_routines.id
  exercises jsonb not null default '[]'::jsonb,    -- WorkoutExercise[] with nested sets[]
  started_at text not null,                        -- ISO datetime
  ended_at text,                                   -- ISO datetime; null = still active locally
  notes text
);

create index if not exists gym_sessions_user_date_idx on gym_sessions(user_id, date desc);

alter table gym_sessions enable row level security;

drop policy if exists "Users manage own sessions" on gym_sessions;
create policy "Users manage own sessions" on gym_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
