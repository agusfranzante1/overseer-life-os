-- ===========================================================================
-- OFERTAS - PLANTILLAS DE HOJA
--
-- Una fila por plantilla reutilizable global del usuario. El documento de
-- bloques vive entero en payload JSONB para mantener el mismo patron que
-- offer_systems/offers y permitir docs grandes sin app_preferences.
--
-- Correr UNA vez en el SQL editor de Supabase.
-- ===========================================================================

create table if not exists public.offer_templates (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists offer_templates_user_idx
  on public.offer_templates(user_id, updated_at desc);

alter table public.offer_templates enable row level security;

drop policy if exists offer_templates_select on public.offer_templates;
create policy offer_templates_select on public.offer_templates
  for select using (auth.uid() = user_id);

drop policy if exists offer_templates_insert on public.offer_templates;
create policy offer_templates_insert on public.offer_templates
  for insert with check (auth.uid() = user_id);

drop policy if exists offer_templates_update on public.offer_templates;
create policy offer_templates_update on public.offer_templates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists offer_templates_delete on public.offer_templates;
create policy offer_templates_delete on public.offer_templates
  for delete using (auth.uid() = user_id);
