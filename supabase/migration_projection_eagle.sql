-- Proyección: agregar 'eagle' como nivel válido para la Vista de Águila.
-- Es el "examen on-demand" que vive antes de Anual. Usa periodKey='current'
-- (singleton) por ahora — el constraint de unicidad (user, level, period_key)
-- garantiza que hay un solo plan eagle activo por usuario.

alter table public.projection_plans
  drop constraint if exists projection_plans_level_check;

alter table public.projection_plans
  add constraint projection_plans_level_check
  check (level in ('eagle', 'year', 'quarter', 'month'));
