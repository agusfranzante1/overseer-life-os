-- Agrega columnas faltantes a la tabla subtasks para que el sync con
-- localStorage preserve el ciclo de vida completo de cada subtarea.
--
-- Bug que arreglamos: el push y pull de subtasks NO incluía
-- `completed_at`, `archived_at`, `due_date` ni `description`. Resultado:
-- el usuario marcaba una subtask como hecha (local set `completedAt`),
-- el sync subía la row sin ese campo, el siguiente pull devolvía la
-- subtask SIN `completedAt`, y el auto-purge nocturno NUNCA la encontraba
-- como elegible para archivar (su filtro es `!st.completed || !st.completedAt`).
--
-- Las subtasks completadas se acumulaban indefinidamente en la UI a pesar
-- de que la lógica de archive estaba bien.
--
-- Esta migration es idempotente — usa `if not exists` para no romper si
-- ya se aplicó. Aplica con: psql / Supabase SQL Editor → pegar y run.

alter table public.subtasks
  add column if not exists completed_at timestamptz,
  add column if not exists archived_at  timestamptz,
  add column if not exists due_date     date,
  add column if not exists description  text;

-- Índice para que el filtro de "subtasks completadas pero no archivadas"
-- que corre cada noche sea rápido. WHERE completed_at IS NOT NULL AND
-- archived_at IS NULL es el patrón usado por el dispatcher de archive.
create index if not exists idx_subtasks_purge_candidates
  on public.subtasks(user_id, completed_at)
  where completed_at is not null and archived_at is null;
