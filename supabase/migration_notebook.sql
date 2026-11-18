-- ===========================================================================
-- CUADERNO — el anotador flotante que vive al costado de la pantalla en todas
-- las secciones (components/notebook/NotebookDock.tsx).
--
-- Una fila por hoja. Las hojas del diario usan id determinista
-- `nb_dia_<YYYY-MM-DD>` (dos dispositivos escribiendo el mismo día convergen
-- en una hoja); las notas sueltas, id generado.
-- Merge multi-device: LWW por updated_at + tombstones (deleted_rows).
-- Payload JSONB con la hoja entera: tipo (dia | nota), fecha, titulo, texto,
-- papel (renglones | puntos | cuadricula | liso) y stickies[].
--
-- Correr UNA vez en el SQL editor de Supabase.
-- ===========================================================================

create table if not exists public.notebook_pages (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists notebook_pages_user_idx
  on public.notebook_pages(user_id, updated_at desc);

alter table public.notebook_pages enable row level security;

drop policy if exists notebook_pages_select on public.notebook_pages;
create policy notebook_pages_select on public.notebook_pages
  for select using (auth.uid() = user_id);

drop policy if exists notebook_pages_insert on public.notebook_pages;
create policy notebook_pages_insert on public.notebook_pages
  for insert with check (auth.uid() = user_id);

drop policy if exists notebook_pages_update on public.notebook_pages;
create policy notebook_pages_update on public.notebook_pages
  for update using (auth.uid() = user_id);

drop policy if exists notebook_pages_delete on public.notebook_pages;
create policy notebook_pages_delete on public.notebook_pages
  for delete using (auth.uid() = user_id);
