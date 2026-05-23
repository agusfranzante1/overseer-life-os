-- SPI Bitácora de Calibración — cross-session knowledge base.
-- Unlike spi_sessions (one row per Saturday), bitácora entries are
-- GLOBAL per user — they accumulate over time and are visible from
-- every weekly session.

create table if not exists public.spi_bitacora (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('working', 'broken')),
  situation text not null default '',
  domino_effect text not null default '',
  resolved boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spi_bitacora_user_idx
  on public.spi_bitacora(user_id, created_at desc);

alter table public.spi_bitacora enable row level security;

drop policy if exists spi_bitacora_select on public.spi_bitacora;
create policy spi_bitacora_select on public.spi_bitacora
  for select using (auth.uid() = user_id);

drop policy if exists spi_bitacora_insert on public.spi_bitacora;
create policy spi_bitacora_insert on public.spi_bitacora
  for insert with check (auth.uid() = user_id);

drop policy if exists spi_bitacora_update on public.spi_bitacora;
create policy spi_bitacora_update on public.spi_bitacora
  for update using (auth.uid() = user_id);

drop policy if exists spi_bitacora_delete on public.spi_bitacora;
create policy spi_bitacora_delete on public.spi_bitacora
  for delete using (auth.uid() = user_id);
