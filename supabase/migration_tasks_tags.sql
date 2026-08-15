-- Etiquetas libres (tags) transversales a proyectos. Sin esto, el push de
-- tareas falla al escribir la columna `tags` y el sync de tareas se corta.
-- jsonb con default '[]' → las tareas existentes quedan sin etiquetas.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb;
