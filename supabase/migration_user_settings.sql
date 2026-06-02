-- User settings — preferencias del usuario que el SERVER necesita leer
-- (no solo el cliente). Hoy estas viven en `useAppStore` (zustand) en el
-- browser, lo cual está bien para el render del cliente pero NO sirve
-- para el dispatcher de notificaciones que corre del lado server desde un
-- cron job.
--
-- Esta tabla espeja al server las pocas preferencias que el dispatcher
-- necesita para decidir QUÉ y CUÁNDO mandar:
--   * timezone           → para calcular "hora local del usuario" en cada tick
--   * notification_prefs → toggles ON/OFF por canal
--   * habit_reminder_*   → a qué hora del día disparar el recordatorio de hábitos
--   * lead times         → cuántos minutos ANTES del dueDate/SPI mandar
--
-- El cliente la actualiza vía upsert cada vez que el usuario cambia algo
-- en Settings. El server (service role) la lee en cada tick del cron.

create table if not exists user_settings (
  user_id                       uuid primary key references auth.users(id) on delete cascade,
  -- IANA timezone string — ej. 'America/Argentina/Buenos_Aires'. Se
  -- detecta vía Intl.DateTimeFormat() en el cliente al primer login y
  -- después es editable en Settings.
  timezone                      text not null default 'UTC',
  -- Toggles por canal — { spiNewSession: true, taskDueSoon: true, ... }.
  -- Mismo shape que `appStore.notificationPrefs` en el cliente.
  notification_prefs            jsonb not null default '{}'::jsonb,
  -- Hora del día (0-23) en HORA LOCAL del usuario en la que el server
  -- dispara el recordatorio de hábitos del día. Default 21:00.
  habit_reminder_hour           integer not null default 21,
  habit_reminder_minute         integer not null default 0,
  -- Lead time en minutos para "task due soon" — cuánto antes del dueDate
  -- el server dispara el aviso. Default 60 (1 hora antes).
  task_due_lead_minutes         integer not null default 60,
  -- Lead time en minutos para "SPI nuevo habilitado". 0 = en el momento.
  spi_new_lead_minutes          integer not null default 0,
  updated_at                    timestamptz not null default now()
);

alter table user_settings enable row level security;

-- El usuario gestiona SUS propias settings desde el cliente.
create policy "user manages own settings"
  on user_settings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- El service role lee TODAS las settings (las necesita el dispatcher
-- para recorrer todos los usuarios).
create policy "service role reads all settings"
  on user_settings
  for select
  to service_role
  using (true);

-- Trigger: actualizar `updated_at` automáticamente en cada UPDATE.
create or replace function user_settings_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_settings_touch_updated_at_trg on user_settings;
create trigger user_settings_touch_updated_at_trg
  before update on user_settings
  for each row execute function user_settings_touch_updated_at();
