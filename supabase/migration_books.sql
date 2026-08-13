-- ===========================================================================
-- LIBROS - SEGUIMIENTO SIMPLE DE LECTURA
--
-- Una fila por libro. El payload JSONB guarda el modelo completo para mantener
-- forward-compat y el mismo patron per-fila que YouTube/Meditaciones.
--
-- Correr UNA vez en el SQL editor de Supabase.
-- ===========================================================================

create table if not exists public.books (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists books_user_idx
  on public.books(user_id, updated_at desc);

alter table public.books enable row level security;

drop policy if exists books_select on public.books;
create policy books_select on public.books
  for select using (auth.uid() = user_id);

drop policy if exists books_insert on public.books;
create policy books_insert on public.books
  for insert with check (auth.uid() = user_id);

drop policy if exists books_update on public.books;
create policy books_update on public.books
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists books_delete on public.books;
create policy books_delete on public.books
  for delete using (auth.uid() = user_id);
