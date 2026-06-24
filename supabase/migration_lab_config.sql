-- Laboratorio: ejercicios y categorías custom (labStore.customExercises /
-- customCategories).
--
-- Bug: estos dos los creabas vos pero vivían SOLO en localStorage — el lab
-- solo sincronizaba `lab_sessions` y `lab_beliefs`. Resultado: los ejercicios
-- y categorías custom no aparecían en otros dispositivos (y las sesiones que
-- los referenciaban quedaban sin su definición).
--
-- Singleton por usuario, dos arrays JSONB. Mismo patrón que gym_config /
-- food_data (last-write-wins a nivel config).

create table if not exists public.lab_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  custom_exercises jsonb not null default '[]'::jsonb,
  custom_categories jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);

alter table public.lab_config enable row level security;

drop policy if exists lab_config_own on public.lab_config;
create policy lab_config_own on public.lab_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
