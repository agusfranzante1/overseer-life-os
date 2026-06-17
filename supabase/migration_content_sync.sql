-- ─── CONTENIDO multi-device (sync de Content Strategy) ───────────────────────
--
-- Hasta ahora el módulo Contenido (perfiles + ADN + pilares + estilo visual,
-- campañas, items) vivía SOLO en localStorage. Esto lo sincroniza a Supabase con
-- el mismo patrón que el resto (id + columnas clave + payload jsonb + updated_at,
-- LWW + tombstones via deleted_rows). Las imágenes del estilo visual ya viven en
-- Storage (bucket content-visual); acá sincroniza el METADATA (qué imagen va en
-- qué categoría, perfiles, etc.).
--
-- Correr UNA vez en el SQL editor de Supabase.

-- ── Perfiles (el payload incluye brandDNA, pilares, networks, visualStyle) ──
create table if not exists public.content_profiles (
  id         text        primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload    jsonb       not null
);
alter table public.content_profiles enable row level security;
create policy "content_profiles: own" on public.content_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists content_profiles_user_idx on public.content_profiles (user_id);

-- ── Campañas ──
create table if not exists public.content_campaigns (
  id         text        primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  profile_id text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload    jsonb       not null
);
alter table public.content_campaigns enable row level security;
create policy "content_campaigns: own" on public.content_campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists content_campaigns_user_idx on public.content_campaigns (user_id);

-- ── Items (piezas/posts) ──
create table if not exists public.content_items (
  id         text        primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  profile_id text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload    jsonb       not null
);
alter table public.content_items enable row level security;
create policy "content_items: own" on public.content_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists content_items_user_idx on public.content_items (user_id);
