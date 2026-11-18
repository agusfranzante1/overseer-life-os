-- ===========================================================================
-- MENSAJES PARA CLAUDE — lo que el usuario dicta a un chat de Claude para que
-- se lo pase a otro ("mandale a Karla que…"). Lo escribe el bridge MCP
-- (`upsert_record`, dominio `mensajes`), lo reparte el cartero (tarea
-- programada del Buzón) y el cartero lo marca entregado.
--
-- Una fila por mensaje. Merge multi-device: LWW por updated_at + tombstones
-- (la tabla genérica deleted_rows). Payload JSONB con el mensaje entero:
-- para, texto, fecha, origen, estado (pendiente | entregado), entregadoEn.
--
-- Correr UNA vez en el SQL editor de Supabase.
-- ===========================================================================

create table if not exists public.claude_messages (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists claude_messages_user_idx
  on public.claude_messages(user_id, updated_at desc);

alter table public.claude_messages enable row level security;

drop policy if exists claude_messages_select on public.claude_messages;
create policy claude_messages_select on public.claude_messages
  for select using (auth.uid() = user_id);

drop policy if exists claude_messages_insert on public.claude_messages;
create policy claude_messages_insert on public.claude_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists claude_messages_update on public.claude_messages;
create policy claude_messages_update on public.claude_messages
  for update using (auth.uid() = user_id);

drop policy if exists claude_messages_delete on public.claude_messages;
create policy claude_messages_delete on public.claude_messages
  for delete using (auth.uid() = user_id);
