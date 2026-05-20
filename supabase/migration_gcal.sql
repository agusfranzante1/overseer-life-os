-- ===========================================================================
-- Overseer Life OS — Migration Google Calendar credentials
-- ===========================================================================
-- Ejecutar en SQL Editor de Supabase.
-- Guarda las credenciales OAuth de Google por usuario.
-- El client_secret se guarda en texto — Supabase lo encripta at rest.
-- ===========================================================================

create table if not exists public.gcal_credentials (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  client_id    text not null,
  client_secret text not null,
  refresh_token text,
  access_token  text,
  token_expiry  bigint,
  connected     boolean not null default false,
  updated_at    timestamptz default now()
);

alter table public.gcal_credentials enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'gcal_credentials' and policyname = 'gcal_credentials: own'
  ) then
    execute 'create policy "gcal_credentials: own" on public.gcal_credentials
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  end if;
end $$;

-- ===========================================================================
