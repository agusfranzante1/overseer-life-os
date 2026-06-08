-- Agrega `recurrence` a subtasks — mismo modelo que tasks.recurrence.
-- Cuando una subtarea con recurrence + dueDate se marca completed, el
-- store spawnea automáticamente la siguiente instancia como hermana.
alter table public.subtasks
  add column if not exists recurrence jsonb;
