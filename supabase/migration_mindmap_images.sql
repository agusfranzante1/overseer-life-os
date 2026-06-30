-- ─── IMÁGENES DE MAPAS MENTALES — Supabase Storage ──────────────────────────
--
-- Los mapas mentales ahora soportan "nodos imagen": el usuario sube una foto
-- que se renderiza como una caja redondeada, redimensionable y movible como
-- cualquier otro nodo. El archivo se guarda en Supabase Storage (bucket
-- `mindmap-images`) y en el nodo guardamos SOLO la URL pública + el path
-- (para poder borrar el objeto después).
--
-- ¿Por qué Storage y no base64 en el payload? Cada mapa se sincroniza como un
-- único blob JSONB (columna `payload` de la tabla `mindmaps`) y también vive
-- entero en localStorage. Meter imágenes base64 ahí dentro inflaría TODO el
-- payload del mapa en cada edición y reventaría la cuota de localStorage. Con
-- Storage el nodo guarda apenas un string-URL → el payload sigue liviano.
--
-- Cada archivo se sube bajo:
--     <userId>/<mapId>/<imageId>.<ext>
--
-- Bucket PÚBLICO: cualquiera con la URL puede ver la imagen. La ESCRITURA y el
-- BORRADO están gateados por RLS a la carpeta propia del usuario (mismo patrón
-- que `content-visual`, ver migration_visual_style.sql).
--
-- Correr UNA vez en el SQL editor de Supabase.

insert into storage.buckets (id, name, public)
values ('mindmap-images', 'mindmap-images', true)
on conflict (id) do nothing;

create policy "mindmap-images: read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'mindmap-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "mindmap-images: insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mindmap-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "mindmap-images: delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'mindmap-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
