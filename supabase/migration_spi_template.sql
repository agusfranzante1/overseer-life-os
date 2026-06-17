-- ─── SPI TEMPLATE (plantilla editable: títulos de sección, carriles, checklist) ──
--
-- El template del SPI (lib/spi/template.ts + ediciones del usuario vía el
-- TemplateEditor) vivía SOLO en localStorage de cada device. Si renombrabas
-- una sección o cambiabas un carril en la notebook, el cambio nunca llegaba
-- a la PC. Esta tabla lo sincroniza como una fila singleton por usuario.
--
-- LWW por `version`: el spiStore bumpea template.version en cada edición
-- (updateTemplate/resetTemplate). El pull adopta el remoto solo si su version
-- es mayor que la local; el push solo pisa el remoto si el local es >= remoto.
--
-- Correr una vez en el SQL editor de Supabase.

create table if not exists public.spi_template (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  version integer not null default 0,
  updated_at timestamptz default now()
);

alter table public.spi_template enable row level security;

create policy "spi_template: own" on public.spi_template
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
