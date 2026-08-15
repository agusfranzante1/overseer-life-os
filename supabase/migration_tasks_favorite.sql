-- migration_tasks_favorite.sql
--
-- Adds `favorite` to public.tasks. Boolean flag toggled from the TaskCard
-- actions menu (⋯ → ⭐). Favorited tasks surface in the "Favoritas" widget
-- on the Dashboard regardless of which project owns them.
--
-- Default false so existing rows stay non-favorite. NOT NULL keeps the
-- column tidy — the app always pushes `favorite: t.favorite ?? false`.
--
-- Safe to run multiple times (idempotent via IF NOT EXISTS).
-- IMPORTANT: hasta que esto no se corra, el push de tasks va a fallar
-- (columna desconocida) y el sync de tareas se corta. Correr en el SQL
-- Editor de Supabase.

alter table public.tasks
  add column if not exists favorite boolean not null default false;
