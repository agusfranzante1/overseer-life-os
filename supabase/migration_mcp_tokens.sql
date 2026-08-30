-- ===========================================================================
-- Overseer Life OS — Migration: tokens del bridge con Claude
-- ===========================================================================
-- Ejecutar en el SQL Editor de Supabase.
--
-- Habilita `/api/mcp` y `/api/export/brief`: los dos únicos endpoints que se
-- autentican con un TOKEN PERSONAL en vez de la cookie de sesión, para que
-- Claude (corriendo en la suscripción del usuario, sin API key facturada)
-- pueda leer tareas/agenda y escribir el plan del día.
--
-- El token en claro NUNCA se guarda: se almacena solo su sha256 y se le
-- muestra al usuario una única vez al generarlo. Revocar = setear revoked_at
-- (no se borra la fila, así queda el rastro de que existió).
-- ===========================================================================

create table if not exists public.mcp_tokens (
  -- sha256 hex del token. Es la PK: la resolución en cada request es un
  -- lookup por clave primaria, no un scan con string compare.
  token_hash    text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- Nombre que le pone el usuario para saber cuál es cuál ("Claude Code PC",
  -- "claude.ai celu"). Sirve para revocar el correcto.
  label         text not null default 'Claude',
  created_at    timestamptz not null default now(),
  -- Última vez que se usó. Es lo que le permite al usuario detectar un token
  -- que quedó colgado o que alguien más está usando.
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index if not exists mcp_tokens_user_idx
  on public.mcp_tokens(user_id) where revoked_at is null;

alter table public.mcp_tokens enable row level security;

do $$
begin
  -- El usuario gestiona SUS tokens desde Configuración (crear, listar, revocar).
  if not exists (
    select 1 from pg_policies where tablename = 'mcp_tokens' and policyname = 'mcp_tokens: own'
  ) then
    execute 'create policy "mcp_tokens: own" on public.mcp_tokens for all to authenticated
      using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  end if;

  -- El bridge corre con service role y necesita resolver el token -> user_id
  -- ANTES de saber quién es el usuario (no hay sesión). Solo SELECT.
  if not exists (
    select 1 from pg_policies where tablename = 'mcp_tokens' and policyname = 'mcp_tokens: service reads'
  ) then
    execute 'create policy "mcp_tokens: service reads" on public.mcp_tokens for select
      to service_role using (true)';
  end if;

  -- El bridge también actualiza `last_used_at` en cada request.
  if not exists (
    select 1 from pg_policies where tablename = 'mcp_tokens' and policyname = 'mcp_tokens: service touches'
  ) then
    execute 'create policy "mcp_tokens: service touches" on public.mcp_tokens for update
      to service_role using (true) with check (true)';
  end if;
end $$;
