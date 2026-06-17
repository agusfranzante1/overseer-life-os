-- ─── ESTILO VISUAL (mood boards de Contenido) — Supabase Storage ─────────────
--
-- El módulo Contenido suma un apartado "Estilo visual" por perfil: categorías
-- ("Estilo videos", "Estilo portadas", …) con imágenes subidas por el user.
-- Las imágenes se guardan como archivos en Supabase Storage (bucket
-- `content-visual`); el metadata (categorías + qué imagen va dónde) vive en el
-- contentStore (localStorage). Cada archivo se sube bajo:
--     <userId>/<profileId>/<categoryId>/<imageId>.<ext>
--
-- Bucket PÚBLICO: cualquiera con la URL puede ver la imagen (es un mood board,
-- no contenido sensible). La ESCRITURA/BORRADO está gateada por RLS a la carpeta
-- propia del usuario.
--
-- Correr UNA vez en el SQL editor de Supabase.

insert into storage.buckets (id, name, public)
values ('content-visual', 'content-visual', true)
on conflict (id) do nothing;

-- Lectura: pública (el bucket es public). Igual dejamos un select para listar
-- desde el cliente autenticado si hiciera falta.
create policy "content-visual: read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'content-visual'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "content-visual: insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'content-visual'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "content-visual: delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'content-visual'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
