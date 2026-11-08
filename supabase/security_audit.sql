-- SALOGBOOK security audit. READ-ONLY: it only reads settings, it changes nothing.
-- Run in Supabase Dashboard -> SQL Editor. Each block returns rows ONLY when there is a problem,
-- except the last one, which lists everything so you can eyeball it. Empty result = good.

-- 1. Tables in the public schema WITHOUT row-level security (anyone signed in could read/write all rows).
select 'NO RLS' as problem, tablename
from pg_tables
where schemaname = 'public' and not rowsecurity;

-- 2. Policies with no real condition at all (using true / no using AND no check) on pilot data.
select 'OPEN POLICY' as problem, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and (qual = 'true' or with_check = 'true' or (qual is null and with_check is null))
  and tablename in ('flights', 'endorsements', 'documents', 'profiles', 'trip_notes', 'push_subscriptions', 'currency_lapses');

-- 3. Policies aimed explicitly at the anon (not-signed-in) role. (Roles shown as {public} are fine when the
--    rule uses auth.uid(): a signed-out visitor has no id and matches nothing.)
select 'ANON ACCESS' as problem, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and 'anon' = any(roles)
  and tablename in ('flights', 'endorsements', 'documents', 'profiles', 'trip_notes', 'push_subscriptions', 'currency_lapses');

-- 4. The pilot-docs storage bucket must be private.
select 'BUCKET IS PUBLIC' as problem, id, name from storage.buckets where id = 'pilot-docs' and public;

-- 5. Storage policies on pilot-docs that do not restrict files to the owner's own folder.
select 'STORAGE POLICY NOT OWNER-ONLY' as problem, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%pilot-docs%'
  and (coalesce(qual, '') || coalesce(with_check, '')) not ilike '%auth.uid()%';

-- 6. Everything, for reading: every policy on your tables.
select tablename, policyname, cmd, roles, qual as "using", with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, cmd, policyname;
