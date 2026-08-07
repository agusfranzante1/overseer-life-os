-- ===========================================================================
-- YOUTUBE — cola personal de videos para ver, en formato kanban.
--
-- Una fila por video (mismo patrón por-fila que meditation_entries y journal).
-- El item entero vive en `payload` jsonb: título, url, videoId, estado,
-- categoría, notas, favorito y completedAt.
-- ===========================================================================

create table if not exists public.youtube_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists youtube_items_user_idx
  on public.youtube_items(user_id, updated_at desc);

alter table public.youtube_items enable row level security;

drop policy if exists youtube_items_select on public.youtube_items;
create policy youtube_items_select on public.youtube_items
  for select using (auth.uid() = user_id);

drop policy if exists youtube_items_insert on public.youtube_items;
create policy youtube_items_insert on public.youtube_items
  for insert with check (auth.uid() = user_id);

drop policy if exists youtube_items_update on public.youtube_items;
create policy youtube_items_update on public.youtube_items
  for update using (auth.uid() = user_id);

drop policy if exists youtube_items_delete on public.youtube_items;
create policy youtube_items_delete on public.youtube_items
  for delete using (auth.uid() = user_id);
