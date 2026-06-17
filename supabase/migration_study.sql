-- ─── ESTUDIO (módulo independiente: Carrera › Materia › Parcial › Tema) ──────
--
-- Antes "Estudio" vivía sobre el task manager (Project type='subject' +
-- SubjectParcial + Task.parcialId). Ahora es un módulo propio (lib/store/
-- studyStore.ts) con sus propias tablas. Cada nivel es una colección plana,
-- normalizada por el id de su padre, que sincroniza con LWW por updated_at +
-- tombstones (tabla deleted_rows) — igual que tasks/spi/etc.
--
-- Patrón de cada tabla: id + user_id + (parent_id) + created_at + updated_at +
-- payload jsonb (el objeto de dominio completo, estilo spi_sessions /
-- projection_plans / lab_sessions). Los `payload` de los temas incluyen su
-- sub-checklist `items`.
--
-- Correr UNA vez en el SQL editor de Supabase.

-- ── Carreras ──
create table if not exists public.study_carreras (
  id         text        primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload    jsonb       not null
);
alter table public.study_carreras enable row level security;
create policy "study_carreras: own" on public.study_carreras
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists study_carreras_user_idx on public.study_carreras (user_id);

-- ── Materias ──
create table if not exists public.study_materias (
  id         text        primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  carrera_id text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload    jsonb       not null
);
alter table public.study_materias enable row level security;
create policy "study_materias: own" on public.study_materias
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists study_materias_user_idx on public.study_materias (user_id);
create index if not exists study_materias_carrera_idx on public.study_materias (user_id, carrera_id);

-- ── Parciales ──
create table if not exists public.study_parciales (
  id         text        primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  materia_id text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload    jsonb       not null
);
alter table public.study_parciales enable row level security;
create policy "study_parciales: own" on public.study_parciales
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists study_parciales_user_idx on public.study_parciales (user_id);
create index if not exists study_parciales_materia_idx on public.study_parciales (user_id, materia_id);

-- ── Temas (incluyen su sub-checklist `items` dentro del payload) ──
create table if not exists public.study_temas (
  id         text        primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  parcial_id text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload    jsonb       not null
);
alter table public.study_temas enable row level security;
create policy "study_temas: own" on public.study_temas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists study_temas_user_idx on public.study_temas (user_id);
create index if not exists study_temas_parcial_idx on public.study_temas (user_id, parcial_id);
