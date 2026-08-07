-- ===========================================================================
-- MIND MAP FOLDERS — carpetas para agrupar mapas mentales.
--
-- La pestaña "General" NO vive acá: es una vista de todos los mapas ordenados
-- por más reciente. Solo se guardan las carpetas reales que crea el usuario.
--
-- La carpeta a la que pertenece cada mapa (`folderId`) viaja dentro del
-- payload del mapa en la tabla `mindmaps` — no hace falta join.
--
-- Se sincronizan en el MISMO dominio de sync que los mapas, así que borrarlas
-- usa las tombstones de siempre (tabla deleted_rows, table_name =
-- 'mindmap_folders').
-- ===========================================================================

create table if not exists public.mindmap_folders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists mindmap_folders_user_idx
  on public.mindmap_folders(user_id, updated_at desc);

alter table public.mindmap_folders enable row level security;

drop policy if exists mindmap_folders_select on public.mindmap_folders;
create policy mindmap_folders_select on public.mindmap_folders
  for select using (auth.uid() = user_id);

drop policy if exists mindmap_folders_insert on public.mindmap_folders;
create policy mindmap_folders_insert on public.mindmap_folders
  for insert with check (auth.uid() = user_id);

drop policy if exists mindmap_folders_update on public.mindmap_folders;
create policy mindmap_folders_update on public.mindmap_folders
  for update using (auth.uid() = user_id);

drop policy if exists mindmap_folders_delete on public.mindmap_folders;
create policy mindmap_folders_delete on public.mindmap_folders
  for delete using (auth.uid() = user_id);
