-- ===========================================================================
-- APP PREFERENCES — singleton por usuario.
--
-- Persiste preferencias del appStore que tienen sentido SINCRONIZAR entre
-- dispositivos (orden del sidebar, idioma, timezone, schedule ideal, AI
-- settings, métricas subjetivas, etc.). NO incluye estado efímero de UI
-- como sidebarCollapsed o activeSection — eso queda por dispositivo.
--
-- Estructura JSONB para forward-compat: si agregamos un campo nuevo al
-- store, no hace falta tocar la DB ni correr otra migración.
-- ===========================================================================

create table if not exists public.app_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.app_preferences enable row level security;

drop policy if exists "app_preferences: own" on public.app_preferences;
create policy "app_preferences: own" on public.app_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
