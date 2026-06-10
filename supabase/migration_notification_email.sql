-- Email destino para las notificaciones del dispatcher. Si está NULL,
-- el dispatcher usa `auth.users.email` (el email con el que se loguea
-- el user). Si está seteado, prevalece — útil si querés que las notis
-- vayan a un email distinto del de la cuenta.
--
-- El flag para HABILITAR el envío por email vive en `notification_prefs`
-- como `emailNotifications: true|false`. Sin ese flag en true, este
-- campo no hace nada (el push sigue funcionando como antes).
--
-- Idempotente: IF NOT EXISTS.

alter table public.user_settings
  add column if not exists notification_email text;
