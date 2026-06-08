-- Sistema de Estudio + Sistema de Contenido — extiende projects y tasks
-- con metadata especializada. Mantiene compat con proyectos "standard"
-- (los campos nuevos son NULL para ellos y la UI los ignora).
--
-- Cambios:
--   projects.type             text   — 'standard' | 'subject' | 'content'
--   projects.subject_meta     jsonb  — { profesor, codigo, cuatrimestre, parciales[...] }
--   projects.content_meta     jsonb  — { channel, stages[...] }
--   tasks.parcial_id          text   — apunta a subject_meta.parciales[].id
--
-- Idempotente — usa IF NOT EXISTS. Aplica con: Supabase SQL Editor → Run.

alter table public.projects
  add column if not exists type         text,
  add column if not exists subject_meta jsonb,
  add column if not exists content_meta jsonb;

alter table public.tasks
  add column if not exists parcial_id   text;

-- parent_project_id — permite agrupar proyectos bajo un container (ej.
-- "Estudios" como padre de todas las materias). El task manager filtra
-- proyectos con parentProjectId para que NO aparezcan top-level.
alter table public.projects
  add column if not exists parent_project_id text;

-- Index para buscar rápido todos los proyectos por type. Útil para que
-- /estudio levante materias sin escanear todos los proyectos del user.
create index if not exists idx_projects_type
  on public.projects(user_id, type)
  where type is not null;
