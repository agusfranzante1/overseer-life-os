-- ===========================================================================
-- ARCA — el ticket de acceso (TA) del WSAA, persistido.
--
-- POR QUÉ EXISTE ESTA TABLA, que parece de más:
-- El WSAA entrega un ticket que dura horas y **se niega a dar otro mientras
-- el anterior siga vivo** ("El CEE ya posee un TA valido para el acceso al
-- WSN solicitado"). Guardarlo en memoria del proceso alcanza en un servidor
-- que no se apaga, pero en Vercel cada invocación puede ser un proceso nuevo:
-- el cache se pierde, se pide otro ticket, y ARCA lo rechaza. La app queda sin
-- poder facturar con el certificado perfecto.
--
-- Pasó exactamente eso el 2026-10-09, en el primer intento real.
--
-- El token es una CREDENCIAL: la tabla es solo-service-role (como
-- notification_log), nunca accesible desde el cliente.
--
-- Correr UNA vez en el SQL editor de Supabase.
-- ===========================================================================

create table if not exists public.arca_tickets (
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- 'homologacion' | 'produccion': los tickets no se mezclan entre entornos.
  entorno    text not null,
  servicio   text not null default 'wsfe',
  token      text not null,
  sign       text not null,
  expira_en  timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, entorno, servicio)
);

alter table public.arca_tickets enable row level security;

-- Sin policies para el rol autenticado: solo el service role entra. Un token
-- de ARCA en manos del navegador es una credencial fiscal expuesta.
drop policy if exists arca_tickets_service on public.arca_tickets;
create policy arca_tickets_service on public.arca_tickets
  for all using (auth.role() = 'service_role');

comment on table public.arca_tickets is
  'Ticket de acceso del WSAA (token+sign). Persistido porque ARCA no entrega uno nuevo mientras el anterior siga vigente, y en serverless el cache en memoria se pierde entre invocaciones.';
