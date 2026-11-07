-- Trip notebook: run once in the Supabase SQL editor.
-- Photos are stored in the existing private "pilot-docs" bucket under <user id>/notebook/.
create table if not exists public.trip_notes (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  flight_id uuid,
  trip text not null default 'General',
  body text not null default '',
  photos jsonb not null default '[]'::jsonb,
  noted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trip_notes_pilot_idx on public.trip_notes (pilot_id, noted_at desc);
alter table public.trip_notes enable row level security;
drop policy if exists "trip_notes_select" on public.trip_notes;
drop policy if exists "trip_notes_insert" on public.trip_notes;
drop policy if exists "trip_notes_update" on public.trip_notes;
drop policy if exists "trip_notes_delete" on public.trip_notes;
create policy "trip_notes_select" on public.trip_notes for select using (pilot_id = auth.uid());
create policy "trip_notes_insert" on public.trip_notes for insert with check (pilot_id = auth.uid());
create policy "trip_notes_update" on public.trip_notes for update using (pilot_id = auth.uid()) with check (pilot_id = auth.uid());
create policy "trip_notes_delete" on public.trip_notes for delete using (pilot_id = auth.uid());
