-- ===========================================================================
-- TAREAS — fecha de INICIO (`start_date`), para la vista Línea de tiempo.
--
-- Hasta ahora una tarea era un punto en el tiempo: su `due_date`. Con el
-- inicio pasa a ser una BARRA ("esto me lleva del 10 al 14"), que es lo que
-- hace que un Gantt sirva para repartir trabajo en vez de ser una lista
-- rotada.
--
-- `tasks` usa COLUMNAS REALES (no un payload jsonb), así que el campo nuevo
-- necesita esta migración. Mientras no se corra, el push sigue andando: el
-- cliente descarta la columna que la tabla no tiene y sincroniza el resto
-- (`lib/supabase/upsertTolerant.ts`), con un toast diciendo cuál falta — pero
-- la fecha de inicio NO viaja entre dispositivos hasta correrla.
--
-- Correr UNA vez en el SQL editor de Supabase. Es aditiva: no toca ninguna
-- fila existente (las tareas de hoy quedan con start_date NULL, que la app
-- lee como "sin inicio", exactamente como se comportan ahora).
-- ===========================================================================

alter table public.tasks
  add column if not exists start_date date;

comment on column public.tasks.start_date is
  'Día en que la tarea empieza. Con due_date forma la barra de la vista Línea de tiempo. NULL = sin inicio (la tarea es un punto: su due_date).';
