-- Distribución semanal de entrenamiento (gymStore.trainingPlan).
--
-- Bug: el `trainingPlan` (qué categorías se entrenan cada día de la semana)
-- se guardaba SOLO en localStorage y nunca se sincronizaba a Supabase, así
-- que lo que marcabas en la PC no aparecía en el celular.
--
-- Lo agregamos al singleton `gym_config` como JSONB con forma
-- { "<dow 0-6>": TrainingCategory[] }. Default '{}' para filas existentes.

alter table public.gym_config
  add column if not exists training_plan jsonb not null default '{}'::jsonb;
