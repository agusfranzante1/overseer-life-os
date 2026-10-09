-- ===========================================================================
-- ARCA — los comprobantes emitidos (historial de facturación).
--
-- Patrón por-fila con payload jsonb, como `tools` o `decisions`.
--
-- EL ID NO ES AL AZAR, y eso es a propósito: es
--   arca_<entorno>_<puntoVenta>_<tipo>_<numero>
-- porque un comprobante fiscal YA tiene identidad propia. Dos consecuencias
-- que valen la tabla:
--   · la emisión escribe del lado del SERVIDOR (el CAE es irreversible: una
--     factura que existe en ARCA y no acá es una factura perdida) y el cliente
--     la agrega a su store sin esperar el pull — con ids al azar serían dos
--     filas para una sola factura;
--   · la importación (releer de ARCA lo ya emitido) es idempotente sola: lo
--     que ya está se reconoce, no se duplica.
--
-- El ENTORNO entra en el id porque homologación y producción son dos
-- universos separados que los dos numeran desde 1. La factura C nº 1 de
-- homologación es una prueba; la nº 1 de producción es una factura de verdad.
--
-- RLS normal por usuario: a diferencia de `arca_tickets` (que guarda una
-- credencial y es solo-service-role), esto son DATOS del usuario y los tiene
-- que poder leer y escribir su propio cliente para sincronizar.
--
-- Correr UNA vez en el SQL editor de Supabase.
-- ===========================================================================

create table if not exists public.arca_comprobantes (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload    jsonb not null default '{}'::jsonb
);

alter table public.arca_comprobantes enable row level security;

drop policy if exists arca_comprobantes_select on public.arca_comprobantes;
create policy arca_comprobantes_select on public.arca_comprobantes
  for select using (auth.uid() = user_id);

drop policy if exists arca_comprobantes_insert on public.arca_comprobantes;
create policy arca_comprobantes_insert on public.arca_comprobantes
  for insert with check (auth.uid() = user_id);

drop policy if exists arca_comprobantes_update on public.arca_comprobantes;
create policy arca_comprobantes_update on public.arca_comprobantes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists arca_comprobantes_delete on public.arca_comprobantes;
create policy arca_comprobantes_delete on public.arca_comprobantes
  for delete using (auth.uid() = user_id);

create index if not exists arca_comprobantes_user_idx
  on public.arca_comprobantes (user_id, updated_at desc);

comment on table public.arca_comprobantes is
  'Comprobantes de ARCA emitidos o importados. El id es determinista (entorno + punto de venta + tipo + numero) para que la emision server-side y la importacion sean idempotentes.';
