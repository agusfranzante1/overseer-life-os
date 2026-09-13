-- ===========================================================================
-- HERRAMIENTAS — el catálogo de herramientas (edición de video, personajes
-- con IA, voces, lo que sea): nombre, link, categoría libre, notas y ⭐.
--
-- Una fila por herramienta. Merge multi-device: LWW por updated_at +
-- tombstones (la tabla genérica deleted_rows). Payload JSONB con la
-- herramienta entera para forward-compat si sumamos campos.
--
-- Correr UNA vez en el SQL editor de Supabase.
-- ===========================================================================

create table if not exists public.tools (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists tools_user_idx
  on public.tools(user_id, updated_at desc);

alter table public.tools enable row level security;

drop policy if exists tools_select on public.tools;
create policy tools_select on public.tools
  for select using (auth.uid() = user_id);

drop policy if exists tools_insert on public.tools;
create policy tools_insert on public.tools
  for insert with check (auth.uid() = user_id);

drop policy if exists tools_update on public.tools;
create policy tools_update on public.tools
  for update using (auth.uid() = user_id);

drop policy if exists tools_delete on public.tools;
create policy tools_delete on public.tools
  for delete using (auth.uid() = user_id);
