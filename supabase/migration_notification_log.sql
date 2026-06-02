-- Notification log — idempotencia del dispatcher de push notifications.
-- Cada fila representa UNA notificación que el server YA envió a un usuario.
-- El unique constraint (user_id, notification_type, dedupe_key) impide que
-- el mismo aviso se mande dos veces (ej. el recordatorio de hábitos de
-- HOY, una task que vence en X minutos, etc.).
--
-- El cron consulta esta tabla ANTES de mandar para preguntar:
--   "¿Ya mandé `habit_reminder:2026-06-02` a este usuario hoy?"
-- Si la respuesta es SÍ → skip silencioso. Si NO → manda + inserta fila.
--
-- Service role only — los usuarios no leen ni escriben esta tabla directamente.

create table if not exists notification_log (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  -- 'habit_reminder' | 'task_due' | 'task_overdue' | 'spi_new'
  notification_type   text not null,
  -- Llave de deduplicación:
  --   habit_reminder → 'YYYY-MM-DD'         (un aviso por día)
  --   task_due       → 'task:{taskId}:due'  (un aviso por task)
  --   task_overdue   → 'task:{taskId}:od:YYYY-MM-DD' (un aviso por task por día)
  --   spi_new        → 'spi:YYYY-MM-DD'     (sábado del cierre)
  dedupe_key          text not null,
  sent_at             timestamptz not null default now(),
  -- Copia del payload que mandamos — útil para debug ("qué decía la
  -- notificación que me llegó el martes a las 21:00?").
  payload             jsonb,
  -- Resultado del envío: { sent: n, gone: [...sub_ids], failed: [...] }.
  -- Si `gone` no está vacío, el dispatcher elimina esas subscripciones.
  result              jsonb,

  constraint notification_log_unique
    unique (user_id, notification_type, dedupe_key)
);

-- Index para que el dispatcher pueda buscar rápido "¿qué le mandé a este
-- usuario en las últimas N horas?" — útil para rate-limiting y debug.
create index if not exists notification_log_recent_idx
  on notification_log (user_id, sent_at desc);

alter table notification_log enable row level security;

-- Solo el service-role (server cron) lee/escribe esta tabla. Los usuarios
-- nunca interactúan con ella directamente desde el cliente.
create policy "service role manages notification_log"
  on notification_log
  for all
  to service_role
  using (true)
  with check (true);
