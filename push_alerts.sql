-- SALOGBOOK push alerts: tables, row-level security and the daily schedule.
-- Run once: Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Afterwards deploy the function (see send-currency-alerts.ts) and run the schedule block at the bottom.

-- One row per phone/browser that turned push alerts on.
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- The dates each tracked requirement will lapse. The app replaces a pilot's rows whenever they change.
create table if not exists public.currency_lapses (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rule_id    text not null,
  label      text not null,
  lapse_date date not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, rule_id)
);

-- Which warning bands have already been sent, so a pilot is never warned twice for the same band.
create table if not exists public.push_sent (
  user_id    uuid not null references auth.users(id) on delete cascade,
  rule_id    text not null,
  lapse_date date not null,
  band       int  not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, rule_id, lapse_date, band)
);

alter table public.push_subscriptions enable row level security;
alter table public.currency_lapses    enable row level security;
alter table public.push_sent          enable row level security;   -- no policies: only the service role (the function) can touch it

drop policy if exists "own subscriptions" on public.push_subscriptions;
create policy "own subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own lapses" on public.currency_lapses;
create policy "own lapses" on public.currency_lapses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- Daily schedule (run AFTER the function is deployed) ---------------------------------------------
-- Replace PUT_YOUR_CRON_SECRET_HERE with the same value you set as the CRON_SECRET function secret.
-- 05:00 UTC = 07:00 in South Africa.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('salogbook-currency-alerts', '0 5 * * *', $$
--   select net.http_post(
--     url     := 'https://vxjkegfpwpuiolgzchkm.supabase.co/functions/v1/send-currency-alerts',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PUT_YOUR_CRON_SECRET_HERE'),
--     body    := '{}'::jsonb);
-- $$);
-- To stop it later:  select cron.unschedule('salogbook-currency-alerts');
