-- ─── DELETED ROWS (tombstones globales para sync multi-device) ──────────────
--
-- EL PROBLEMA QUE ARREGLA
-- ───────────────────────
-- El merge no-destructivo por unión (lib/supabase/syncMerge.ts) nunca borra
-- una fila salvo que el "baseline" local (localStorage de ESE device) diga que
-- la fila estaba sincronizada y ya no está. Pero el baseline vive por-device y
-- está vacío/viejo justo cuando hace falta (un celu que no abrió la app hace
-- días). Resultado: ese device trata sus tareas viejas como "nuevas", las
-- conserva, las pushea, y RESUCITAN en los otros devices. Y al revés, un
-- borrado hecho en la PC no llegaba al celu de forma confiable.
--
-- LA SOLUCIÓN
-- ───────────
-- Un registro GLOBAL de borrados. Cuando un device borra una fila, escribe acá
-- {table_name, row_id, deleted_at}. En cada pull, cualquier device descarta esa
-- fila (local o remota) si el tombstone es más nuevo que el `updatedAt` de la
-- fila. Así el borrado es autoritativo entre devices, sin depender del baseline
-- local. Re-crear una fila (mismo id, updatedAt más nuevo) la "revive"
-- automáticamente porque su updatedAt gana sobre el tombstone viejo.
--
-- Es una tabla genérica: `table_name` distingue projects/tasks/subtasks (y en el
-- futuro cualquier otro dominio que adopte el mecanismo). `row_id` es text para
-- soportar tanto uuids como ids naturales.
--
-- Correr UNA vez en el SQL editor de Supabase.

create table if not exists public.deleted_rows (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  table_name text        not null,
  row_id     text        not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, table_name, row_id)
);

alter table public.deleted_rows enable row level security;

create policy "deleted_rows: own" on public.deleted_rows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists deleted_rows_user_table_idx
  on public.deleted_rows (user_id, table_name);
