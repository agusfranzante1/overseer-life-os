-- Favoritos a nivel subtarea (⭐). Sin esto, el push de tareas falla al
-- escribir la columna `favorite` de `subtasks` y el sync de tareas se corta.
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS favorite boolean;
