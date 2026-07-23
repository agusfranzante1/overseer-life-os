-- Proyección: agregar 'semester' como nivel válido.
--
-- El semestre (periodKey 'YYYY-H1' | 'YYYY-H2') es el nuevo puente entre el
-- Anual y el Trimestre: Año → Semestre → Trimestre → Mes → Semana. Reemplaza
-- a la Vista de Águila ('eagle', que queda solo por compat de datos viejos).
--
-- Correr UNA vez en el SQL editor de Supabase.

alter table public.projection_plans
  drop constraint if exists projection_plans_level_check;

alter table public.projection_plans
  add constraint projection_plans_level_check
  check (level in ('eagle', 'year', 'semester', 'quarter', 'month'));
