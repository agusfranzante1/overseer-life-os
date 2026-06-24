-- Catálogo de alimentos (foodStore.foods).
--
-- Bug: `foods` (la base de alimentos con macros que editás y a la que se
-- linkean los items de cada comida) se guardaba SOLO en localStorage y no
-- se sincronizaba. Los alimentos cargados en la PC no aparecían en el celu,
-- y los items que linkeaban a esos alimentos quedaban rotos en otros devices.
--
-- Lo agregamos al singleton `food_data` como JSONB (array de FoodEntry).

alter table public.food_data
  add column if not exists foods jsonb not null default '[]'::jsonb;
