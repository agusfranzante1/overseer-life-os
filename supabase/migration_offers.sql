-- ===========================================================================
-- CRM DE OFERTAS
--
-- Dos tablas por-fila (mismo patrón que meditation_entries / youtube_items):
--   offer_systems → el sistema (ej. "Offer System: DRM") CON su documento
--                   libre de bloques adentro del payload.
--   offers        → cada oferta, con su etapa, categorías y GEOs.
--
-- Las etapas, categorías y GEOs son listas cortas y compartidas por todos los
-- sistemas: viven en el payload de app_preferences (blob), no acá. Así no hace
-- falta una tabla por cada catálogo.
-- ===========================================================================

create table if not exists public.offer_systems (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);
create index if not exists offer_systems_user_idx on public.offer_systems(user_id, updated_at desc);
alter table public.offer_systems enable row level security;
drop policy if exists offer_systems_select on public.offer_systems;
create policy offer_systems_select on public.offer_systems for select using (auth.uid() = user_id);
drop policy if exists offer_systems_insert on public.offer_systems;
create policy offer_systems_insert on public.offer_systems for insert with check (auth.uid() = user_id);
drop policy if exists offer_systems_update on public.offer_systems;
create policy offer_systems_update on public.offer_systems for update using (auth.uid() = user_id);
drop policy if exists offer_systems_delete on public.offer_systems;
create policy offer_systems_delete on public.offer_systems for delete using (auth.uid() = user_id);

create table if not exists public.offers (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);
create index if not exists offers_user_idx on public.offers(user_id, updated_at desc);
alter table public.offers enable row level security;
drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers for select using (auth.uid() = user_id);
drop policy if exists offers_insert on public.offers;
create policy offers_insert on public.offers for insert with check (auth.uid() = user_id);
drop policy if exists offers_update on public.offers;
create policy offers_update on public.offers for update using (auth.uid() = user_id);
drop policy if exists offers_delete on public.offers;
create policy offers_delete on public.offers for delete using (auth.uid() = user_id);
