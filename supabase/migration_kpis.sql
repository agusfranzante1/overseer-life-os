-- Tabla de definiciones de KPIs. Cada fila es UN KPI de la library del
-- user (lo que ves en /kpis → Library). Antes esta data SOLO vivía en
-- localStorage de cada device → si formateabas o cambiabas de máquina,
-- perdías los KPIs. Ahora sincroniza con Supabase como el resto de los
-- dominios.
--
-- Estrategia: payload JSONB para flexibilidad (igual que mindmaps, lab,
-- projection, spi). Eso permite agregar campos al KPIDefinition (cosa
-- que ya pasó con cumulativeTarget) sin migraciones nuevas.
--
-- Aplicar: pegar en SQL Editor de Supabase y run.

create table if not exists public.kpis (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_kpis_user on public.kpis(user_id);

alter table public.kpis enable row level security;

-- RLS: cada user solo ve / edita sus propios KPIs.
create policy "kpis: own" on public.kpis
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
