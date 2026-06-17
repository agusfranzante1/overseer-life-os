-- ─── PROJECTS: sort_order (orden manual del sidebar del task manager) ────────
--
-- El task manager deja reordenar proyectos con ↑/↓ (tasksStore.reorderProject,
-- campo Project.order). Ese orden se guardaba en localStorage pero NUNCA se
-- sincronizaba: el push de tasks no mandaba el orden y el pull traía el proyecto
-- SIN orden, así que el merge (projects no tienen updatedAt → gana remote) pisaba
-- el orden local en cada pull → "no se guarda el orden de los proyectos".
--
-- Esta columna lo persiste/sincroniza. Correr UNA vez en el SQL editor de Supabase.

alter table public.projects
  add column if not exists sort_order integer;

create index if not exists projects_user_order_idx
  on public.projects(user_id, sort_order);
