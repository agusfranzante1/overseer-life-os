-- ===========================================================================
-- MAPAS DE CONCEPTOS (materias en modo 'conceptos').
--
-- Una fila = el mapa entero de UNA materia (áreas + conceptos con posición),
-- dentro de `payload` JSONB. id = materiaId. Merge multi-device: LWW por
-- updated_at + tombstones (tabla genérica deleted_rows). Mismo patrón que
-- mindmaps / trading_backtests.
--
-- Correr UNA vez en el SQL editor de Supabase.
-- ===========================================================================

create table if not exists public.study_concept_maps (
  id text primary key,                 -- = materiaId
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists study_concept_maps_user_idx
  on public.study_concept_maps(user_id, updated_at desc);

alter table public.study_concept_maps enable row level security;

drop policy if exists study_concept_maps_select on public.study_concept_maps;
create policy study_concept_maps_select on public.study_concept_maps
  for select using (auth.uid() = user_id);

drop policy if exists study_concept_maps_insert on public.study_concept_maps;
create policy study_concept_maps_insert on public.study_concept_maps
  for insert with check (auth.uid() = user_id);

drop policy if exists study_concept_maps_update on public.study_concept_maps;
create policy study_concept_maps_update on public.study_concept_maps
  for update using (auth.uid() = user_id);

drop policy if exists study_concept_maps_delete on public.study_concept_maps;
create policy study_concept_maps_delete on public.study_concept_maps
  for delete using (auth.uid() = user_id);
