-- ===========================================================================
-- Overseer Life OS — Migration: planes del día (dominio `dayPlan`)
-- ===========================================================================
-- Ejecutar en el SQL Editor de Supabase.
--
-- Guarda el plan de acción de cada día: los bloques que arma Claude a través
-- del bridge (`/api/mcp` → `save_day_plan`) y que el usuario ve en el widget
-- "Plan de hoy" del Panel, en cualquier dispositivo.
--
-- El `id` es DETERMINISTA (`plan_<YYYY-MM-DD>`): un plan por día. Con un id
-- random, dos dispositivos generarían planes distintos para la misma fecha y
-- el merge por id los sumaría en vez de resolverlos — es el mismo bug que ya
-- pasó con las instancias recurrentes.
-- ===========================================================================

create table if not exists public.day_plans (
  id          text primary key,          -- `plan_<YYYY-MM-DD>`
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  -- Array de bloques: { id, start?, end?, taskId?, title, kind, reason?, done? }
  blocks      jsonb not null default '[]'::jsonb,
  -- Resumen / consejo del día escrito por Claude.
  note        text,
  -- 'claude' | 'manual' — de dónde salió el plan.
  source      text not null default 'claude',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists day_plans_user_date_idx on public.day_plans(user_id, date);

alter table public.day_plans enable row level security;

do $$
begin
  -- El usuario lee y edita sus planes desde la app (tildar un bloque, etc).
  if not exists (
    select 1 from pg_policies where tablename = 'day_plans' and policyname = 'day_plans: own'
  ) then
    execute 'create policy "day_plans: own" on public.day_plans for all to authenticated
      using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  end if;
end $$;

-- Nota: el bridge escribe con el service role, que saltea RLS por diseño. No
-- necesita policy propia — la barrera ahí es el `.eq('user_id', ...)` explícito
-- en cada query de lib/mcp/writes.ts.
