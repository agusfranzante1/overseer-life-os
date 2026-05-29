-- ===========================================================================
-- MIND MAPS — mapas mentales del usuario.
--
-- Cada row representa UN mapa entero. Nodos y aristas viven dentro del
-- payload JSONB para evitar joins en queries simples (un mapa típico tiene
-- 10-50 nodos como mucho — no vale la pena normalizar).
-- ===========================================================================

create table if not exists public.mindmaps (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists mindmaps_user_idx
  on public.mindmaps(user_id, updated_at desc);

alter table public.mindmaps enable row level security;

drop policy if exists mindmaps_select on public.mindmaps;
create policy mindmaps_select on public.mindmaps
  for select using (auth.uid() = user_id);

drop policy if exists mindmaps_insert on public.mindmaps;
create policy mindmaps_insert on public.mindmaps
  for insert with check (auth.uid() = user_id);

drop policy if exists mindmaps_update on public.mindmaps;
create policy mindmaps_update on public.mindmaps
  for update using (auth.uid() = user_id);

drop policy if exists mindmaps_delete on public.mindmaps;
create policy mindmaps_delete on public.mindmaps
  for delete using (auth.uid() = user_id);
