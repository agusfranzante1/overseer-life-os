-- Agrega la columna `rescheduled_from` a tasks para el botón
-- "Reprogramada para HOY" en TaskDetail. Guarda la fecha original
-- (YYYY-MM-DD) cuando el user mueve la dueDate a hoy porque se le
-- pasó, así la UI puede mostrar el badge "⚠ TARDÍA".
alter table public.tasks
  add column if not exists rescheduled_from text;
