-- Persiste en Supabase los campos de Task que se fueron agregando al
-- model local pero NUNCA se incluyeron en el push/pull.
--
-- Bug que arreglamos: el user le ponía dueTime a una tarea, push iba a
-- Supabase SIN due_time, pull devolvía la task SIN due_time → setState
-- pisaba el local → la hora se perdía silenciosamente. Mismo problema
-- con duration, gcalEventId, etc.
--
-- Por qué importa específicamente:
--   - dueTime / duration: define a qué hora aparece la task en el
--     calendario y cuánto dura el bloque.
--   - gcalEventId / gcalCalendarId: linkea la task con su evento de
--     Google Calendar. Sin esto, al hacer pull el sync va a creer que
--     no hay evento y va a crear un duplicado al próximo sync.
--   - notifyBeforeMinutes: override per-task del lead time de
--     notificación. Sin esto cada pull resetea al global default.
--   - recurrence: la regla de recurrencia. Sin esto se pierde la
--     recurrencia al refrescar.
--
-- Idempotente. Aplicar en Supabase SQL Editor.

alter table public.tasks
  add column if not exists due_time              text,
  add column if not exists duration_minutes      integer,
  add column if not exists gcal_event_id         text,
  add column if not exists gcal_calendar_id      text,
  add column if not exists notify_before_minutes integer,
  add column if not exists recurrence            jsonb;

-- Comentarios para que sea fácil entender qué guarda cada columna desde
-- el SQL editor de Supabase.
comment on column public.tasks.due_time is
  'Hora HH:MM 24h (string). Si NULL, la task es all-day. Si tiene valor + due_date, es un bloque con hora.';
comment on column public.tasks.duration_minutes is
  'Solo aplica cuando due_time existe. Default 60 (1h) en el cliente. Define el alto del bloque en el calendario.';
comment on column public.tasks.gcal_event_id is
  'ID del evento de Google Calendar linkeado. Sin esto el sync no sabe qué evento updatear.';
comment on column public.tasks.gcal_calendar_id is
  'ID del calendario donde vive el evento. Necesario porque la API de GCal pide calendarId además de eventId.';
comment on column public.tasks.notify_before_minutes is
  'Override per-task del lead time de notificación de vencimiento. Si NULL, se usa el default global de prefs.';
comment on column public.tasks.recurrence is
  'Regla de recurrencia (JSONB: { kind, daysOfWeek?, until? }). Al completar genera la próxima instancia.';
