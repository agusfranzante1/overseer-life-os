-- Agrega columnas `due_time` y `duration_minutes` a la tabla `subtasks`
-- para que las subtareas puedan tener hora y duración, igual que las
-- tareas madre, y aparecer como bloques timeados en el calendario.
--
-- Sin esta migration, el push de subtasks falla con un error de columna
-- inexistente apenas el usuario abre una subtask y le pone hora.
--
-- Idempotente — usa `if not exists`. Aplica con Supabase SQL Editor.

alter table public.subtasks
  add column if not exists due_time         text,   -- 'HH:MM' 24h
  add column if not exists duration_minutes integer;
