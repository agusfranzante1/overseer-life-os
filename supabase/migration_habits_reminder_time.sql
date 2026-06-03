-- Habit-specific reminder time
--
-- Cada hábito puede tener una hora opcional (HH:MM) en hora LOCAL del
-- usuario para que el dispatcher mande UN push ese día a esa hora si:
--   1) El toggle global `habitSpecificReminders` está ON.
--   2) El hábito tiene `reminder_time` no nulo.
--   3) Hoy es un target day del hábito (o targetDays está vacío = todos).
--   4) El hábito no fue marcado todavía (no está en completedDates ni
--      en skippedDates).
--   5) La hora local actual cae en la ventana de 5 min del reminder_time.
--   6) No se mandó otro push para este hábito hoy (dedupe en notification_log).

alter table habits
  add column if not exists reminder_time text;

comment on column habits.reminder_time is
  'Hora HH:MM 24h en hora local del usuario para enviar recordatorio. Null = sin recordatorio puntual.';
