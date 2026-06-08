-- Snapshots manuales del task manager — el user clickea "Guardar ahora"
-- para crear un punto fijo de proyectos+tareas antes de probar cambios
-- riesgosos. "Cargar última versión" restaura el snapshot más reciente.
--
-- Tabla simple: el payload completo va en JSONB. RLS por user_id.
-- Idempotente — IF NOT EXISTS por todos lados.

create table if not exists public.task_snapshots (
  id          text         primary key,
  user_id     uuid         not null references auth.users(id) on delete cascade,
  label       text,
  payload     jsonb        not null,
  created_at  timestamptz  not null default now()
);

alter table public.task_snapshots enable row level security;

drop policy if exists task_snapshots_owner_select on public.task_snapshots;
create policy task_snapshots_owner_select on public.task_snapshots
  for select using (auth.uid() = user_id);

drop policy if exists task_snapshots_owner_insert on public.task_snapshots;
create policy task_snapshots_owner_insert on public.task_snapshots
  for insert with check (auth.uid() = user_id);

drop policy if exists task_snapshots_owner_delete on public.task_snapshots;
create policy task_snapshots_owner_delete on public.task_snapshots
  for delete using (auth.uid() = user_id);

create index if not exists idx_task_snapshots_user_created
  on public.task_snapshots(user_id, created_at desc);
