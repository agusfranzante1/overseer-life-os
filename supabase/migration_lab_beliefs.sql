-- ===========================================================================
-- LAB BELIEFS — catálogo de creencias detectadas, persistido por usuario.
--
-- Las creencias son entidades de primera clase (NO sesiones). Cada una vive
-- en un row, tiene status (open / working / resolved), y opcionalmente una
-- "insight" capturada al resolverla. Las sesiones de Reencuadre se linkean
-- a su creencia origen vía LabSession.linkedBeliefId (que vive en el payload
-- de lab_sessions, no acá).
-- ===========================================================================

create table if not exists public.lab_beliefs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_key text not null default 'creencias',
  text text not null,
  status text not null default 'open' check (status in ('open', 'working', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  insight text,
  linked_session_ids text[] not null default '{}'::text[]
);

create index if not exists lab_beliefs_user_idx
  on public.lab_beliefs(user_id, status, updated_at desc);

alter table public.lab_beliefs enable row level security;

drop policy if exists lab_beliefs_select on public.lab_beliefs;
create policy lab_beliefs_select on public.lab_beliefs
  for select using (auth.uid() = user_id);

drop policy if exists lab_beliefs_insert on public.lab_beliefs;
create policy lab_beliefs_insert on public.lab_beliefs
  for insert with check (auth.uid() = user_id);

drop policy if exists lab_beliefs_update on public.lab_beliefs;
create policy lab_beliefs_update on public.lab_beliefs
  for update using (auth.uid() = user_id);

drop policy if exists lab_beliefs_delete on public.lab_beliefs;
create policy lab_beliefs_delete on public.lab_beliefs
  for delete using (auth.uid() = user_id);
