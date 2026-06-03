-- Persiste los flags de "system project" en Supabase.
--
-- Bug que arreglamos: el campo `systemProjectKey` del store (que marca
-- un proyecto como "del sistema" — ej. el proyecto SPI auto-creado al
-- cerrar la sesión semanal) NUNCA se subía a Supabase. Resultado: el
-- pull devolvía el proyecto sin tag → ensureSystemProject no lo
-- reconocía como el existente → creaba uno nuevo cada vez que cerrabas
-- un SPI semanal → duplicados sin fin en el task manager.
--
-- Idempotente, podés correrlo varias veces sin riesgo.

alter table public.projects
  add column if not exists is_system_project boolean default false,
  add column if not exists system_project_key text;

create index if not exists idx_projects_system_key
  on public.projects(user_id, system_project_key)
  where system_project_key is not null;
