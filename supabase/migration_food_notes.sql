-- Food: add free-form `notes` column for diet reminders / memos
-- ("acordarme de hidratarme", "el martes ayuno 24h", etc.)

alter table public.food_data
  add column if not exists notes text not null default '';
