-- ===========================================================================
-- PUSH SUBSCRIPTIONS — Web Push API endpoints registered by each user
-- device/browser.
--
-- Cada row representa UNA suscripción de UN dispositivo. Un usuario puede
-- tener varios (iPhone + laptop + iPad). Cuando el server quiere mandar una
-- notificación, agarra TODAS las suscripciones del user y le manda a cada
-- una vía Web Push protocol con sus VAPID keys.
-- ===========================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Endpoint URL único per browser/device. Si el browser renueva la
  -- suscripción, el endpoint cambia → upsert by endpoint para no duplicar.
  endpoint text not null unique,
  -- Crypto keys exchanged at subscription time. Required by the Web Push
  -- protocol to encrypt the payload so only the user's device can decrypt.
  p256dh text not null,
  auth text not null,
  -- Human label (e.g. "iPhone de Agus", "Chrome MacBook") so the user can
  -- distinguish them in the Settings UI.
  device_label text,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id, enabled);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update using (auth.uid() = user_id);

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete using (auth.uid() = user_id);
