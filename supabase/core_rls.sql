-- SALOGBOOK: owner-only access for the core tables and the pilot-docs bucket.
-- Run ONLY if supabase/security_audit.sql shows these are missing. Safe to re-run: it only replaces policies
-- with the names used here. IMPORTANT: policies add up (any matching policy allows access), so if the audit
-- reports an OPEN POLICY or ANON ACCESS row, drop that policy in Dashboard -> Authentication -> Policies.

alter table public.flights      enable row level security;
alter table public.endorsements enable row level security;
alter table public.documents    enable row level security;
alter table public.profiles     enable row level security;

drop policy if exists "owner_all" on public.flights;
create policy "owner_all" on public.flights for all to authenticated
  using (pilot_id = auth.uid()) with check (pilot_id = auth.uid());

drop policy if exists "owner_all" on public.endorsements;
create policy "owner_all" on public.endorsements for all to authenticated
  using (pilot_id = auth.uid()) with check (pilot_id = auth.uid());

drop policy if exists "owner_all" on public.documents;
create policy "owner_all" on public.documents for all to authenticated
  using (pilot_id = auth.uid()) with check (pilot_id = auth.uid());

drop policy if exists "owner_all" on public.profiles;
create policy "owner_all" on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Files live under <user id>/... in the private pilot-docs bucket.
drop policy if exists "pilot_docs_owner_select" on storage.objects;
drop policy if exists "pilot_docs_owner_insert" on storage.objects;
drop policy if exists "pilot_docs_owner_update" on storage.objects;
drop policy if exists "pilot_docs_owner_delete" on storage.objects;
create policy "pilot_docs_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'pilot-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pilot_docs_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'pilot-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pilot_docs_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'pilot-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pilot_docs_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'pilot-docs' and (storage.foldername(name))[1] = auth.uid()::text);
